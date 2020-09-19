import * as ts from 'typescript'
const SyntaxKind = ts.SyntaxKind
import { Result, Ok, Err } from '@blainehansen/monads'
import { MacroContext, DecoratorMacro, DecoratorMacroResult } from '@blainehansen/macro-ts'

import { Dict } from './utils'

type TsNodeErrArgs = Parameters<MacroContext['TsNodeErr']>
type NodeResult<T> = Result<T, TsNodeErrArgs>
function TsNodeErr<T>(ctx: MacroContext, ...tsNodeErrArgs: TsNodeErrArgs): NodeResult<T> {
	return Err(tsNodeErrArgs)
}
function resultMap<T, U>(ctx: MacroContext, arr: Iterable<T>, fn: (value: T) => NodeResult<U>): U[] {
	const final = []
	for (const item of arr) {
		const result = fn(item)
		if (result.isOk()) {
			final.push(result.value)
			continue
		}
		ctx.subsume(ctx.TsNodeErr(...result.error))
	}
	return final
}

function isNodeExported(node: ts.Node): boolean {
	return (
		(ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0
		|| (!!node.parent && node.parent.kind === ts.SyntaxKind.SourceFile)
	)
}

export const decodable = DecoratorMacro((ctx, statement) => {
	const isExported = isNodeExported(statement)
	if (ts.isTypeAliasDeclaration(statement))
		return decodableForTypeAlias(ctx, statement, isExported)
	if (ts.isClassDeclaration(statement))
		return decodableForClass(ctx, statement, isExported)
	if (ts.isInterfaceDeclaration(statement))
		return decodableForInterface(ctx, statement, isExported)
	if (ts.isFunctionDeclaration(statement))
		return decodableForFunction(ctx, statement, isExported)

	return ctx.TsNodeErr(statement, "Unsupported statement", `The "decodable" macro can only be used on type aliases, classes, and interfaces.`)
})

function decodableForTypeAlias(ctx: MacroContext, alias: ts.TypeAliasDeclaration, isExported: boolean): DecoratorMacroResult {
	const genericNames = produceGenericNames(alias.typeParameters)
	const decoder = decoderForType(ctx, alias.type, genericNames, alias.name.text)
	if (decoder.isErr()) return ctx.TsNodeErr(...decoder.error)
	return ctx.Ok({
		replacement: alias,
		append: [createDecoderModule(isExported, alias.name, alias.typeParameters, decoder.value)],
	})
}

function decodableForInterface(ctx: MacroContext, declaration: ts.InterfaceDeclaration, isExported: boolean): DecoratorMacroResult {
	const genericNames = produceGenericNames(declaration.typeParameters)
	const intersections = declaration.heritageClauses ? intersectionsFromHeritageClauses(ctx, declaration.heritageClauses, genericNames) : undefined
	const decoder = decoderForType(ctx, ts.createTypeLiteralNode(declaration.members), genericNames, declaration.name.text)
	if (decoder.isErr()) return ctx.TsNodeErr(...decoder.error)
	return ctx.Ok({
		replacement: declaration,
		append: [createDecoderModule(
			isExported, declaration.name, declaration.typeParameters,
			intersectOrNot(decoder.value, intersections),
		)],
	})
}


// look for the constructor, and if it exists simply make the decoder for the parameters with a wrapper
// if it doesn't exist then look for an extends heritage, and just use the decoder for that, since the constructor must be derived
// if that doesn't exist then make a trivial decoder that just creates the thing???
// no probably the only reasonable thing to do here is to error. we should be forcing people to use a class convention that is actually reasonable to decode! maybe you can get fancy in the future, but for now keep it simple
function decodableForClass(ctx: MacroContext, declaration: ts.ClassDeclaration, isExported: boolean): DecoratorMacroResult {
	if (!declaration.name)
		return ctx.TsNodeErr(declaration, "Invalid Anonymous Class", "Decodable classes must have a name.")

	const genericNames = produceGenericNames(declaration.typeParameters)
	let constructorDecoder: ts.Expression | undefined = undefined
	for (const member of declaration.members) switch (member.kind) {
		case SyntaxKind.Constructor: {
			const decoder = createDecoderForArgs(ctx, (member as ts.ConstructorDeclaration).parameters, genericNames)
			if (decoder.isErr()) return ctx.TsNodeErr(...decoder.error)
			constructorDecoder = decoder.value
			break
		}
		default: continue
	}
	if (!constructorDecoder)
		return ctx.TsNodeErr(declaration.name, "No Constructor", "Decodable classes must a constructor whose args can be decoded.")

	// TODO this doesn't do the right thing, at this point it's only decoding the args, but we need a combinator to instantiate the class
	return ctx.Ok({
		replacement: declaration,
		append: [createDecoderModule(isExported, declaration.name, declaration.typeParameters, constructorDecoder)],
	})
}


function decodableForFunction(ctx: MacroContext, declaration: ts.FunctionDeclaration, isExported: boolean): DecoratorMacroResult {
	if (!declaration.name)
		return ctx.TsNodeErr(declaration, "Invalid Anonymous Function", "Decodable functions must have a name.")

	const genericNames = produceGenericNames(declaration.typeParameters)
	const decoder = createDecoderForArgs(ctx, declaration.parameters, genericNames)
	if (decoder.isErr()) return ctx.TsNodeErr(...decoder.error)

	return ctx.Ok({
		replacement: declaration,
		append: [createDecoderModule(isExported, declaration.name, declaration.typeParameters, decoder.value)],
	})
}

function tupleOrSpread(tupleArgs: ts.Expression[], spreadArg: ts.Expression | undefined) {
	return spreadArg
		? createCombinatorCall('spread', [ts.createArrayLiteral(tupleArgs, false), spreadArg])
		: createCombinatorCall('tuple', tupleArgs)
}

function createDecoderForArgs(
	ctx: MacroContext,
	parameters: ts.NodeArray<ts.ParameterDeclaration>,
	genericNames: Set<string> | undefined
): NodeResult<ts.Expression> {
	const tupleArgs: ts.Expression[] = []
	let spreadArg: ts.Expression | undefined = undefined
	for (const parameter of parameters) {
		const { dotDotDotToken, questionToken, type, initializer } = parameter
		if (!type)
			return TsNodeErr(ctx, parameter, "No Decodable Type", `The "decode" macro can't create a decoder from an inferred type.`)
		const isRest = !!dotDotDotToken
		const result = decoderForType(ctx, type, genericNames, undefined)
		if (result.isErr()) return Err(result.error)
		const decoder = createOptional(!!questionToken || !!initializer, result.value)
		if (isRest) spreadArg = decoder
		else tupleArgs.push(decoder)
	}

	return Ok(tupleOrSpread(tupleArgs, spreadArg))
}

function createDecoderModule(
	isExported: boolean, name: ts.Identifier,
	typeParameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined,
	decoderExpression: ts.Expression,
) {
	const statement = typeParameters
		? createGenericDecoder(name, typeParameters, decoderExpression)
		: createConcreteDecoder(name, decoderExpression)

	return ts.createModuleDeclaration(
		undefined, conditionalExport(isExported), name,
		ts.createModuleBlock([statement]), ts.NodeFlags.Namespace,
	)
}


function produceGenericNames(typeParameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined) {
	if (!typeParameters)
		return undefined
	const genericNames = new Set<string>()
	for (const typeParameter of typeParameters)
		genericNames.add(typeParameter.name.text)
	return genericNames
}

function createGenericDecoder(
	name: ts.Identifier,
	typeParameters: ts.NodeArray<ts.TypeParameterDeclaration>,
	decoderExpression: ts.Expression,
) {
	const genericNames = new Set<string>()
	const parameters: ts.ParameterDeclaration[] = []
	for (const typeParameter of typeParameters) {
		genericNames.add(typeParameter.name.text)
		parameters.push(ts.createParameter(
			undefined, undefined, undefined, typeParameter.name, undefined,
			ts.createTypeReferenceNode(
				ts.createQualifiedName(ts.createIdentifier('c'), ts.createIdentifier('Decoder')),
				[ts.createTypeReferenceNode(typeParameter.name, undefined)],
			), undefined,
		))
	}

	return ts.createFunctionDeclaration(
		undefined, exportModifers, undefined, ts.createIdentifier('decoder'),
		typeParameters, parameters, undefined,
		ts.createBlock([ts.createReturn(decoderExpression)], true),
	)
}

function createConcreteDecoder(
	name: ts.Identifier,
	decoderExpression: ts.Expression,
) {
	return ts.createVariableStatement(
		exportModifers,
		ts.createVariableDeclarationList([
			ts.createVariableDeclaration(ts.createIdentifier('decoder'), undefined, decoderExpression),
		], ts.NodeFlags.Const),
	)
}

function intersectOrNot(type: ts.Expression, intersections: ts.Expression[] | undefined) {
	return intersections
		? ts.createCall(
			ts.createPropertyAccess(ts.createIdentifier('c'), ts.createIdentifier('intersection')), undefined,
			[type, ...intersections],
		)
		: type
}


const exportModifers = [ts.createModifier(ts.SyntaxKind.ExportKeyword)]
function conditionalExport(isExported: boolean) {
	return isExported ? exportModifers : undefined
}


const primitiveMap = {
	[SyntaxKind.BooleanKeyword]: 'boolean',
	[SyntaxKind.StringKeyword]: 'string',
	[SyntaxKind.NumberKeyword]: 'number',
	[SyntaxKind.BigIntKeyword]: 'bigint',
	[SyntaxKind.ObjectKeyword]: 'object',
	[SyntaxKind.SymbolKeyword]: 'symbol',
	[SyntaxKind.UndefinedKeyword]: 'undefined',
	[SyntaxKind.VoidKeyword]: 'void',
	[SyntaxKind.UnknownKeyword]: 'unknown',
	[SyntaxKind.NeverKeyword]: 'never',
	[SyntaxKind.AnyKeyword]: 'any',
}

function decoderForType(
	ctx: MacroContext,
	typeNode: ts.TypeNode,
	genericNames: Set<string> | undefined,
	aliasName: string | undefined
): NodeResult<ts.Expression> {
	switch (typeNode.kind) {
		case SyntaxKind.BooleanKeyword: case SyntaxKind.StringKeyword:
		case SyntaxKind.NumberKeyword: case SyntaxKind.BigIntKeyword:
		case SyntaxKind.ObjectKeyword: case SyntaxKind.SymbolKeyword:
		case SyntaxKind.UndefinedKeyword: case SyntaxKind.VoidKeyword:
		case SyntaxKind.UnknownKeyword: case SyntaxKind.NeverKeyword: case SyntaxKind.AnyKeyword:
			return Ok(ts.createPropertyAccess(ts.createIdentifier('c'), ts.createIdentifier(primitiveMap[typeNode.kind])))

		case SyntaxKind.TypeReference: {
			const node = typeNode as ts.TypeReferenceNode
			// if a TypeReferenceNode is in genericNames, then we just pass the name along directly
			// TODO catch special references such as Array
			if (ts.isIdentifier(node.typeName) && genericNames && genericNames.has(node.typeName.text))
				return Ok(node.typeName)

			// otherwise we make it name.decoder
			const target = createDecoderAccess(qualifiedToExpression(node.typeName))
			const expression = node.typeArguments
				? ts.createCall(
					target, undefined,
					resultMap(ctx, node.typeArguments, (typeArgument: ts.TypeNode) => decoderForType(ctx, typeArgument, genericNames, undefined)),
				)
				: target
			return Ok(expression)
		}

		case SyntaxKind.LiteralType: {
			const node = typeNode as ts.LiteralTypeNode
			switch (node.literal.kind) {
				case SyntaxKind.NullKeyword: case SyntaxKind.TrueKeyword: case SyntaxKind.FalseKeyword:
				case SyntaxKind.StringLiteral: case SyntaxKind.NumericLiteral: case SyntaxKind.BigIntLiteral:
					return Ok(createCombinatorCall('literal', [createLiteral(node.literal as unknown as LiteralNode)]))

				default:
					return TsNodeErr(ctx, node.literal, "Unsupported Literal Expression")
				// case SyntaxKind.PrefixUnaryExpression:
					// export type PrefixUnaryOperator = SyntaxKind.PlusPlusToken | SyntaxKind.MinusMinusToken | SyntaxKind.PlusToken | SyntaxKind.MinusToken | SyntaxKind.TildeToken | SyntaxKind.ExclamationToken;
					// operator
					// operand
			}
		}

		case SyntaxKind.TypeLiteral: {
			const node = typeNode as ts.TypeLiteralNode
			const properties = resultMap(ctx, node.members, member => {
				if (!member.name || !ts.isIdentifier(member.name))
					return TsNodeErr(ctx, member, "Invalid Name")
				if (!ts.isPropertySignature(member) || !member.type)
					return TsNodeErr(ctx, member, "Unsupported Member")

				const decoder = decoderForType(ctx, member.type, genericNames, undefined)
				if (decoder.isErr()) return Err(decoder.error)
				// CallSignatureDeclaration
				// ConstructSignatureDeclaration
				// PropertySignature
				// MethodSignature
				return Ok(ts.createPropertyAssignment(
					member.name,
					createOptional(!!member.questionToken, decoder.value),
				))
			})

			const args: ts.Expression[] = [ts.createObjectLiteral(properties, false)]
			if (aliasName !== undefined)
				args.unshift(ts.createStringLiteral(aliasName))

			return Ok(createCombinatorCall('object', args))
		}

		case SyntaxKind.ArrayType: {
			const node = typeNode as ts.ArrayTypeNode
			const decoder = decoderForType(ctx, node.elementType, genericNames, undefined)
			if (decoder.isErr()) return Err(decoder.error)
			return Ok(createCombinatorCall('array', [decoder.value]))
		}

		case SyntaxKind.TupleType: {
			const node = typeNode as ts.TupleTypeNode
			const tupleArgs: ts.Expression[] = []
			let spreadArg: ts.Expression | undefined = undefined
			for (const element of node.elements) {
				const [isRest, isOptional, actualNode] =
					ts.isNamedTupleMember(element) ? [!!element.dotDotDotToken, !!element.questionToken, element.type]
					: ts.isRestTypeNode(element) ? [true, false, element.type]
					: ts.isOptionalTypeNode(element) ? [false, true, element.type]
					: [false, false, element]

				const decoder = decoderForType(ctx, actualNode, genericNames, undefined)
				if (decoder.isErr()) {
					ctx.subsume(ctx.TsNodeErr(...decoder.error))
					continue
				}
				if (isRest) {
					if (spreadArg) {
						ctx.subsume(ctx.TsNodeErr(element, "Duplicate Rest"))
						continue
					}
					spreadArg = decoder.value
				}
				else
					tupleArgs.push(createOptional(isOptional, decoder.value))
			}

			return Ok(tupleOrSpread(tupleArgs, spreadArg))
		}

		case SyntaxKind.UnionType: {
			const node = typeNode as ts.UnionTypeNode
			const types = node.types
			const expression = types.every(type => isLiteral(type))
				? createCombinatorCall('literals', (types as unknown as LiteralNode[]).map(createLiteral))
				: createCombinatorCall('union', resultMap(ctx, types, type => decoderForType(ctx, type, genericNames, undefined)))
			return Ok(expression)
		}

		case SyntaxKind.IntersectionType: {
			const node = typeNode as ts.IntersectionTypeNode
			return Ok(createCombinatorCall('intersection', resultMap(ctx, node.types, type => decoderForType(ctx, type, genericNames, undefined))))
		}

		case SyntaxKind.ParenthesizedType: {
			const node = typeNode as ts.ParenthesizedTypeNode
			return decoderForType(ctx, node.type, genericNames, aliasName)
		}

		// OptionalTypeNode and RestTypeNode? I feel like these only make sense in objects and tuples?
		// ConditionalTypeNode
		// InferTypeNode
		// TypeOperatorNode
		// IndexedAccessTypeNode
		// MappedTypeNode

		default:
			return TsNodeErr(ctx, typeNode, "Unsupported Type")
	}
}

function isLiteral(node: ts.TypeNode) {
	switch (node.kind) {
		case SyntaxKind.UndefinedKeyword: case SyntaxKind.NullKeyword: case SyntaxKind.TrueKeyword: case SyntaxKind.FalseKeyword:
		case SyntaxKind.StringLiteral: case SyntaxKind.NumericLiteral: case SyntaxKind.BigIntLiteral:
			return true
		default:
			return false
	}
}
interface LiteralNode extends ts.Node {
	readonly kind: ts.SyntaxKind.UndefinedKeyword | ts.SyntaxKind.NullKeyword | ts.SyntaxKind.TrueKeyword | ts.SyntaxKind.FalseKeyword | ts.SyntaxKind.StringLiteral | ts.SyntaxKind.NumericLiteral | ts.SyntaxKind.BigIntLiteral
}
function createLiteral(literal: LiteralNode): ts.Expression {
	switch (literal.kind) {
		case SyntaxKind.UndefinedKeyword: return ts.createIdentifier('undefined')
		case SyntaxKind.NullKeyword: return ts.createNull()
		case SyntaxKind.TrueKeyword: return ts.createTrue()
		case SyntaxKind.FalseKeyword: return ts.createFalse()
		case SyntaxKind.StringLiteral: return ts.createStringLiteral((literal as unknown as ts.StringLiteral).text)
		case SyntaxKind.NumericLiteral: return ts.createNumericLiteral((literal as unknown as ts.NumericLiteral).text)
		case SyntaxKind.BigIntLiteral: return ts.createBigIntLiteral((literal as unknown as ts.BigIntLiteral).text)
	}
}

function createOptional(isOptional: boolean, decoder: ts.Expression) {
	return isOptional ? createCombinatorCall('optional', [decoder]) : decoder
}

function createCombinatorCall(combinator: string, args: ts.Expression[]) {
	return ts.createCall(ts.createPropertyAccess(ts.createIdentifier('c'), ts.createIdentifier(combinator)), undefined, args)
}

function createDecoderAccess(target: ts.Expression) {
	return ts.createPropertyAccess(target, ts.createIdentifier('decoder'))
}

function intersectionsFromHeritageClauses(
	ctx: MacroContext,
	heritageClauses: ts.NodeArray<ts.HeritageClause>,
	genericNames: Set<string> | undefined,
): ts.Expression[] {
	const expressions: ts.Expression[] = []
	for (const { types } of heritageClauses) for (const { expression, typeArguments } of types) switch (expression.kind) {
		case SyntaxKind.Identifier: {
			const target = createDecoderAccess(expression as ts.Identifier)
			const decoder = typeArguments
				? ts.createCall(
					target, undefined,
					resultMap(ctx, typeArguments, typeArgument => decoderForType(ctx, typeArgument, genericNames, undefined))
				)
				: target
			expressions.push(decoder)
			break
		}
		default:
			ctx.subsume(ctx.TsNodeErr(expression, "Invalid Heritage Clause", `The "decoder" macro can't handle this type.`))
			continue
	}
	return expressions
}

function qualifiedToExpression(typeName: ts.EntityName): ts.Expression {
	return ts.isIdentifier(typeName)
		? typeName
		: ts.createPropertyAccess(
			qualifiedToExpression(typeName.left),
			typeName.right,
		)
}
