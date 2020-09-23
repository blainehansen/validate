import * as ts from 'typescript'
const SyntaxKind = ts.SyntaxKind
import { Result, Ok, Err } from '@blainehansen/monads'
import { MacroContext, DecoratorMacro, DecoratorMacroResult } from '@blainehansen/macro-ts'

import { Dict } from './utils'

type TsNodeErrArgs = Parameters<MacroContext['TsNodeErr']>
type NodeResult<T> = Result<T, TsNodeErrArgs>
function TsNodeErr<T>(...tsNodeErrArgs: TsNodeErrArgs): NodeResult<T> {
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
	return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0
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
	if (ts.isEnumDeclaration(statement))
		return decoderForEnum(ctx, statement, isExported)

	return ctx.TsNodeErr(statement, "Unsupported statement", `The "decodable" macro can only be used on type aliases, classes, and interfaces.`)
})

function decodableForTypeAlias(ctx: MacroContext, alias: ts.TypeAliasDeclaration, isExported: boolean): DecoratorMacroResult {
	const genericNames = produceGenericNames(alias.typeParameters)
	const originalAlias = createGenericAlias(alias.name, alias.typeParameters)
	const decoder = decoderForType(ctx, alias.type, genericNames, originalAlias)
	if (decoder.isErr()) return ctx.TsNodeErr(...decoder.error)

	return ctx.Ok({
		replacement: alias,
		append: [createDecoderModule(isExported, alias.name, alias.typeParameters, decoder.value)],
	})
}

function createGenericAlias(
	name: ts.Identifier,
	typeParameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined,
): GenericAlias {
	return {
		name: name.text, type: ts.createTypeReferenceNode(
			name.text,
			typeParameters ? typeParameters.map(typeParameter => ts.createTypeReferenceNode(typeParameter.name.text)) : undefined,
		)
	}
}

function decodableForInterface(ctx: MacroContext, declaration: ts.InterfaceDeclaration, isExported: boolean): DecoratorMacroResult {
	const genericNames = produceGenericNames(declaration.typeParameters)
	const intersections = declaration.heritageClauses ? intersectionsFromHeritageClauses(ctx, declaration.heritageClauses, genericNames) : undefined
	const originalAlias = createGenericAlias(declaration.name, declaration.typeParameters)
	const decoder = decoderForType(
		ctx, ts.createTypeLiteralNode(declaration.members), genericNames,
		intersections ? undefined : originalAlias,
	)
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
	const originalAlias = createGenericAlias(declaration.name, declaration.typeParameters)
	let constructorDecoder: ts.Expression | undefined = undefined
	for (const member of declaration.members) switch (member.kind) {
		case SyntaxKind.Constructor: {
			const decoderResult = createDecoderForArgs(ctx, (member as ts.ConstructorDeclaration).parameters, genericNames)
			if (decoderResult.isErr()) return ctx.TsNodeErr(...decoderResult.error)

			const [decoder, argsTupleType] = decoderResult.value
			constructorDecoder = createCombinatorCall(
				'cls', [argsTupleType, originalAlias.type],
				[declaration.name, decoder],
			)
			break
		}
		default: continue
	}
	if (!constructorDecoder)
		return ctx.TsNodeErr(declaration.name, "No Constructor", "Decodable classes must have a constructor whose args can be decoded.")

	return ctx.Ok({
		replacement: declaration,
		append: [createDecoderModule(isExported, declaration.name, declaration.typeParameters, constructorDecoder)],
	})
}

function decoderForEnum(ctx: MacroContext, declaration: ts.EnumDeclaration, isExported: boolean): DecoratorMacroResult {
	const enumName = declaration.name.text
	const clauses: ts.CaseClause[] = []
	for (const [index, member] of declaration.members.entries()) {
		if (!ts.isIdentifier(member.name)) {
			ctx.subsume(ctx.TsNodeErr(member.name, "Invalid Enum Member Name", "At this point we can't handle non Identifier names."))
			continue
		}

		clauses.push(ts.createCaseClause(
			ts.createPropertyAccess(declaration.name, member.name),
			index === declaration.members.length - 1
				? [ts.createReturn(ts.createIdentifier('input'))]
				: [],
		))
	}

	const decoder = createCombinatorCall('wrapEnum', [ts.createTypeReferenceNode(enumName)], [
		ts.createStringLiteral(enumName),
		ts.createFunctionExpression(
			undefined, undefined, undefined, undefined,
			[ts.createParameter(undefined, undefined, undefined, ts.createIdentifier('input'), undefined, undefined, undefined)],
			undefined,
			ts.createBlock([
				ts.createSwitch(ts.createIdentifier('input'), ts.createCaseBlock(clauses)),
				ts.createReturn(ts.createIdentifier('undefined')),
			], true),
		),
	])

	return ctx.Ok({
		replacement: declaration,
		append: [createDecoderModule(isExported, declaration.name, undefined, decoder)],
	})
}


function decodableForFunction(ctx: MacroContext, declaration: ts.FunctionDeclaration, isExported: boolean): DecoratorMacroResult {
	if (!declaration.name)
		return ctx.TsNodeErr(declaration, "Invalid Anonymous Function", "Decodable functions must have a name.")

	const genericNames = produceGenericNames(declaration.typeParameters)
	const decoderResult = createDecoderForArgs(ctx, declaration.parameters, genericNames)
	if (decoderResult.isErr()) return ctx.TsNodeErr(...decoderResult.error)
	const [decoder, ] = decoderResult.value

	return ctx.Ok({
		replacement: declaration,
		append: [createDecoderModule(isExported, declaration.name, declaration.typeParameters, decoder)],
	})
}


function createDecoderForArgs(
	ctx: MacroContext,
	parameters: ts.NodeArray<ts.ParameterDeclaration>,
	genericNames: Set<string> | undefined
): NodeResult<[ts.CallExpression, ts.TupleTypeNode]> {
	const tupleArgs: ts.Expression[] = []
	const tupleTypeArgs: ts.TypeNode[] = []
	let spreadArg: ts.Expression | undefined = undefined
	let spreadTypeArg: ts.TypeNode | undefined = undefined
	for (const parameter of parameters) {
		const { dotDotDotToken, questionToken, type, initializer } = parameter
		if (!type)
			return TsNodeErr(parameter, "No Decodable Type", `The "decode" macro can't create a decoder from an inferred type.`)
		const isRest = !!dotDotDotToken
		const result = decoderForType(ctx, type, genericNames, undefined)
		if (result.isErr()) return Err(result.error)
		const isOptional = !!questionToken || !!initializer
		const decoder = createOptional(isOptional, result.value)
		const finalType = isOptional ? ts.createOptionalTypeNode(type) : type
		if (isRest) {
			spreadArg = decoder
			spreadTypeArg = finalType
		}
		else {
			tupleArgs.push(decoder)
			tupleTypeArgs.push(finalType)
		}
	}

	const typeArgs: ts.TypeNode[] = [ts.createTupleTypeNode(tupleTypeArgs)]
	const argsTupleTypeArgs: ts.TypeNode[] = tupleTypeArgs.slice()
	if (spreadTypeArg) {
		typeArgs.push(spreadTypeArg)
		argsTupleTypeArgs.push(ts.createRestTypeNode(spreadTypeArg))
	}
	const argsTupleType = ts.createTupleTypeNode(argsTupleTypeArgs)
	return Ok([tupleOrSpread(tupleArgs, spreadArg, typeArgs), argsTupleType])
}

function tupleOrSpread(
	tupleArgs: ts.Expression[],
	spreadArg: ts.Expression | undefined,
	typeArguments: ts.TypeNode[],
): ts.CallExpression {
	return spreadArg
		? createCombinatorCall('spread', typeArguments, tupleArgs.concat([spreadArg]))
		: createCombinatorCall('tuple', typeArguments, tupleArgs)
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
	[SyntaxKind.TrueKeyword]: 'trueLiteral',
	[SyntaxKind.FalseKeyword]: 'falseLiteral',
	[SyntaxKind.StringKeyword]: 'string',
	[SyntaxKind.NumberKeyword]: 'number',
	[SyntaxKind.BigIntKeyword]: 'bigint',
	// [SyntaxKind.ObjectKeyword]: 'object',
	// [SyntaxKind.SymbolKeyword]: 'symbol',
	[SyntaxKind.UndefinedKeyword]: 'undefinedLiteral',
	[SyntaxKind.NullKeyword]: 'nullLiteral',
	[SyntaxKind.VoidKeyword]: 'voidLiteral',
	[SyntaxKind.UnknownKeyword]: 'unknown',
	[SyntaxKind.NeverKeyword]: 'never',
}

type GenericAlias = { name: string, type: ts.TypeNode }
function decoderForType(
	ctx: MacroContext,
	typeNode: ts.TypeNode,
	genericNames: Set<string> | undefined,
	originalAlias: GenericAlias | undefined,
): NodeResult<ts.Expression> {
	switch (typeNode.kind) {
		case SyntaxKind.BooleanKeyword: case SyntaxKind.StringKeyword:
		case SyntaxKind.NumberKeyword: case SyntaxKind.BigIntKeyword:
		case SyntaxKind.UndefinedKeyword: case SyntaxKind.VoidKeyword:
		case SyntaxKind.UnknownKeyword: case SyntaxKind.NeverKeyword:
			return Ok(ts.createPropertyAccess(ts.createIdentifier('c'), ts.createIdentifier(primitiveMap[typeNode.kind])))

		// case SyntaxKind.ObjectKeyword: case SyntaxKind.SymbolKeyword:

		case SyntaxKind.TypeReference: {
			const node = typeNode as ts.TypeReferenceNode
			if (ts.isIdentifier(node.typeName)) {
				const typeName = node.typeName.text

				if (genericNames && genericNames.has(typeName))
					return Ok(node.typeName)

				function createWrapCombinator(combinatorName: string, typeNode: ts.TypeNode): NodeResult<ts.Expression> {
					const inner = decoderForType(ctx, typeNode, genericNames, undefined)
					if (inner.isErr()) return inner
					return Ok(createCombinatorCall(combinatorName, node.typeArguments, [inner.value]))
				}

				switch (typeName) {
					case 'Array':
						if (node.typeArguments && node.typeArguments.length === 1)
							return decoderForType(ctx, ts.createArrayTypeNode(node.typeArguments[0]), genericNames, undefined)
						break

					case 'Partial': case 'Required': case 'Readonly': case 'NonNullable':
						if (node.typeArguments && node.typeArguments.length === 1)
							return createWrapCombinator(typeName.toLowerCase(), node.typeArguments[0])
						break

					case 'Dict':
						if (node.typeArguments && node.typeArguments.length === 1)
							return createWrapCombinator('dictionary', node.typeArguments[0])
						break

					// case 'Record'<Keys,Type>:
					// case 'Pick'<Type, Keys>:
					// case 'Omit'<Type, Keys>:
					// case 'Exclude'<Type, ExcludedUnion>:
					// case 'Extract'<Type, Union>:
					// case 'Parameters'<Type>:
					// case 'ConstructorParameters'<Type>:

					default: break
				}
			}

			const target = createDecoderAccess(qualifiedToExpression(node.typeName))
			const expression = node.typeArguments
				? ts.createCall(
					target, node.typeArguments,
					resultMap(ctx, node.typeArguments, (typeArgument: ts.TypeNode) => decoderForType(ctx, typeArgument, genericNames, undefined)),
				)
				: target
			return Ok(expression)
		}

		case SyntaxKind.LiteralType: {
			const node = typeNode as ts.LiteralTypeNode
			switch (node.literal.kind) {
				case SyntaxKind.NullKeyword: case SyntaxKind.TrueKeyword: case SyntaxKind.FalseKeyword:
					return Ok(ts.createPropertyAccess(ts.createIdentifier('c'), ts.createIdentifier(primitiveMap[node.literal.kind])))
				case SyntaxKind.StringLiteral:
				case SyntaxKind.NumericLiteral: case SyntaxKind.BigIntLiteral:
					return Ok(createCombinatorCall('literal', [node], [node.literal]))

				default:
					return TsNodeErr(node.literal, "Unsupported Literal Expression")
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
					return TsNodeErr(member, "Invalid Name")
				if (!ts.isPropertySignature(member) || !member.type)
					return TsNodeErr(member, "Unsupported Member")

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
			if (originalAlias !== undefined)
				args.unshift(ts.createStringLiteral(originalAlias.name))

			return Ok(createCombinatorCall('object', originalAlias ? [originalAlias.type] : [node], args))
		}

		case SyntaxKind.ArrayType: {
			const node = typeNode as ts.ArrayTypeNode
			const decoder = decoderForType(ctx, node.elementType, genericNames, undefined)
			if (decoder.isErr()) return Err(decoder.error)
			return Ok(createCombinatorCall('array', [node.elementType], [decoder.value]))
		}

		case SyntaxKind.TupleType: {
			const node = typeNode as ts.TupleTypeNode
			const tupleArgs: ts.Expression[] = []
			const tupleTypeArgs: ts.TypeNode[] = []
			let spreadArg: ts.Expression | undefined = undefined
			let spreadTypeArg: ts.TypeNode | undefined = undefined
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
					spreadTypeArg = actualNode
				}
				else {
					tupleArgs.push(createOptional(isOptional, decoder.value))
					tupleTypeArgs.push(element)
				}
			}

			const typeArgs: ts.TypeNode[] = [ts.createTupleTypeNode(tupleTypeArgs)]
			if (spreadTypeArg)
				typeArgs.push(spreadTypeArg)
			return Ok(tupleOrSpread(tupleArgs, spreadArg, typeArgs))
		}

		case SyntaxKind.UnionType: {
			const node = typeNode as ts.UnionTypeNode
			const types = node.types
			const typeArgs = [ts.createTupleTypeNode(types)]
			const expression = types.every(type => isLiteral(type))
				? createCombinatorCall(
					'literals', typeArgs,
					(types as ts.NodeArray<LocalLiteralType>).map((literalType: LocalLiteralType): ts.Expression => {
						switch (literalType.kind) {
							case SyntaxKind.UndefinedKeyword:
								return ts.createIdentifier('undefined')
							case SyntaxKind.VoidKeyword:
								return ts.createAsExpression(ts.createIdentifier('undefined'), ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword))
							case SyntaxKind.LiteralType:
								return (literalType as ts.LiteralTypeNode).literal
						}
					}),
				)
				: createCombinatorCall('union', typeArgs, resultMap(ctx, types, type => decoderForType(ctx, type, genericNames, undefined)))

			return Ok(expression)
		}

		case SyntaxKind.IntersectionType: {
			const node = typeNode as ts.IntersectionTypeNode
			return Ok(createCombinatorCall(
				'intersection', [ts.createTupleTypeNode(node.types)],
				resultMap(ctx, node.types, type => decoderForType(ctx, type, genericNames, undefined)),
			))
		}

		case SyntaxKind.ParenthesizedType: {
			const node = typeNode as ts.ParenthesizedTypeNode
			return decoderForType(ctx, node.type, genericNames, originalAlias)
		}

		// OptionalTypeNode and RestTypeNode? I feel like these only make sense in objects and tuples?
		// ConditionalTypeNode
		// InferTypeNode
		// TypeOperatorNode
		// IndexedAccessTypeNode
		// MappedTypeNode

		default:
			return TsNodeErr(typeNode, "Unsupported Type")
	}
}

type LocalLiteralType = ts.KeywordTypeNode<ts.SyntaxKind.UndefinedKeyword | ts.SyntaxKind.VoidKeyword> | ts.LiteralTypeNode
function isLiteral(node: ts.TypeNode): node is LocalLiteralType {
	switch (node.kind) {
		case SyntaxKind.UndefinedKeyword: case SyntaxKind.VoidKeyword:
		case SyntaxKind.LiteralType:
			return true
		default:
			return false
	}
}
interface LiteralNode extends ts.Node {
	readonly kind: ts.SyntaxKind.UndefinedKeyword | ts.SyntaxKind.NullKeyword | ts.SyntaxKind.TrueKeyword | ts.SyntaxKind.FalseKeyword | ts.SyntaxKind.StringLiteral | ts.SyntaxKind.NumericLiteral | ts.SyntaxKind.BigIntLiteral
}

function createOptional(isOptional: boolean, decoder: ts.Expression) {
	return isOptional ? createCombinatorCall('optional', undefined, [decoder]) : decoder
}

function createCombinatorCall(
	combinator: string,
	typeArguments: readonly ts.TypeNode[] | undefined,
	args: ts.Expression[]) {
	return ts.createCall(
		ts.createPropertyAccess(ts.createIdentifier('c'), ts.createIdentifier(combinator)),
		typeArguments, args,
	)
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
