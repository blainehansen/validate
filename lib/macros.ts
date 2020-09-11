import * as ts from 'typescript'
const SyntaxKind = ts.SyntaxKind
import { MacroContext, DecoratorMacro, DecoratorMacroResult } from '@blainehansen/macro-ts'

import { Dict } from './utils'

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

	return ctx.TsNodeErr(statement, 'Invalid statement', `The "decodable" macro can only be used on type aliases, classes, and interfaces.`)
})

function decodableForTypeAlias(ctx: MacroContext, alias: ts.TypeAliasDeclaration, isExported: boolean): DecoratorMacroResult {
	return ctx.Ok({
		replacement: alias,
		append: [createDecoderModule(isExported, alias.name, alias.typeParameters, alias.type, undefined)],
	})
}

function decodableForClass(ctx: MacroContext, declaration: ts.ClassDeclaration, isExported: boolean): DecoratorMacroResult {
	throw new Error()
}

function decodableForInterface(ctx: MacroContext, declaration: ts.InterfaceDeclaration, isExported: boolean): DecoratorMacroResult {
	// name
	// typeParameters?
	// heritageClauses?: ts.NodeArray<{ types: NodeArray<ExpressionWithTypeArguments> }>
	// members: ts.NodeArray<{ name?: PropertyName, questionToken?: QuestionToken }> but we have to narrow them :(

	throw new Error()
}


function createDecoderModule(
	isExported: boolean, name: ts.Identifier,
	typeParameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined, type: ts.TypeNode,
	intersections: ts.Expression[] | undefined,
) {
	const statement = typeParameters
		? createGenericDecoder(name, typeParameters, type, intersections)
		: createConcreteDecoder(name, typeParameters, type, intersections)

	return ts.createModuleDeclaration(
		undefined, conditionalExport(isExported), name,
		ts.createModuleBlock([statement]), ts.NodeFlags.Namespace,
	)
}

function createGenericDecoder(
	name: ts.Identifier,
	typeParameters: ts.NodeArray<ts.TypeParameterDeclaration>, type: ts.TypeNode,
	intersections: ts.Expression[] | undefined,
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
		ts.createBlock([ts.createReturn(
			intersectOrNot(decoderForType(type, genericNames, name.text), intersections),
		)], true),
	)
}

function createConcreteDecoder(
	name: ts.Identifier,
	typeParameters: undefined, type: ts.TypeNode,
	intersections: ts.Expression[] | undefined,
) {
	return ts.createVariableStatement(
		exportModifers,
		ts.createVariableDeclarationList([
			ts.createVariableDeclaration(
				ts.createIdentifier('decoder'), undefined,
				intersectOrNot(decoderForType(type, undefined, name.text), intersections),
			),
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

function decoderForType(t: ts.TypeNode, genericNames: Set<string> | undefined, aliasName: string | undefined): ts.Expression {
	switch (t.kind) {
		case SyntaxKind.BooleanKeyword: case SyntaxKind.StringKeyword:
		case SyntaxKind.NumberKeyword: case SyntaxKind.BigIntKeyword:
		case SyntaxKind.ObjectKeyword: case SyntaxKind.SymbolKeyword:
		case SyntaxKind.UndefinedKeyword: case SyntaxKind.VoidKeyword:
		case SyntaxKind.UnknownKeyword: case SyntaxKind.NeverKeyword: case SyntaxKind.AnyKeyword:
			return ts.createPropertyAccess(ts.createIdentifier('c'), ts.createIdentifier(primitiveMap[t.kind]))

		case SyntaxKind.TypeReference: {
			const node = t as ts.TypeReferenceNode
			// if a TypeReferenceNode is in genericNames, then we just pass the name along directly
			// TODO catch special references such as Array
			if (ts.isIdentifier(node.typeName) && genericNames && genericNames.has(node.typeName.text))
				return node.typeName

			// otherwise we make it name.decoder
			const target = createDecoderAccess(qualifiedToExpression(node.typeName))
			return node.typeArguments
				? ts.createCall(
					target, undefined,
					node.typeArguments.map(typeArgument => decoderForType(typeArgument, genericNames, undefined)),
				)
				: target
		}

		case SyntaxKind.LiteralType: {
			const node = t as ts.LiteralTypeNode
			switch (node.literal.kind) {
				case SyntaxKind.NullKeyword: case SyntaxKind.TrueKeyword: case SyntaxKind.FalseKeyword:
				case SyntaxKind.StringLiteral: case SyntaxKind.NumericLiteral: case SyntaxKind.BigIntLiteral:
					return createCombinatorCall('literal', [createLiteral(node.literal as unknown as LiteralNode)])

				case SyntaxKind.PrefixUnaryExpression:
					throw new Error()
					// export type PrefixUnaryOperator = SyntaxKind.PlusPlusToken | SyntaxKind.MinusMinusToken | SyntaxKind.PlusToken | SyntaxKind.MinusToken | SyntaxKind.TildeToken | SyntaxKind.ExclamationToken;
					// operator
					// operand
			}
		}

		case SyntaxKind.TypeLiteral: {
			const node = t as ts.TypeLiteralNode
			const properties = node.members.map(member => {
				if (!member.name || !ts.isIdentifier(member.name))
					throw new Error()
				if (!ts.isPropertySignature(member) || !member.type)
					throw new Error()
				// if (member.initializer)
				// 	warn

				// TODO handle OptionalTypeNode here?
				// or have we already by handling the questionToken?
				const decoder = decoderForType(member.type, genericNames, undefined)
				// CallSignatureDeclaration
				// ConstructSignatureDeclaration
				// PropertySignature
				// MethodSignature
				return ts.createPropertyAssignment(
					member.name,
					createOptional(!!member.questionToken, decoder),
				)
			})

			const args: ts.Expression[] = [ts.createObjectLiteral(properties, false)]
			if (aliasName !== undefined)
				args.unshift(ts.createStringLiteral(aliasName))

			return createCombinatorCall('looseObject', args)
		}

		case SyntaxKind.ArrayType: {
			const node = t as ts.ArrayTypeNode
			return createCombinatorCall('array', [decoderForType(node.elementType, genericNames, undefined)])
		}

		case SyntaxKind.TupleType: {
			const node = t as ts.TupleTypeNode
			const [tupleArgs, spreadArg] = node.elements.reduce((acc, element) => {
				const [isRest, isOptional, actualNode] =
					ts.isNamedTupleMember(element) ? [!!element.dotDotDotToken, !!element.questionToken, element.type]
					: ts.isRestTypeNode(element) ? [true, false, element.type]
					: ts.isOptionalTypeNode(element) ? [false, true, element.type]
					: [false, false, element]

				const decoder = decoderForType(actualNode, genericNames, undefined)
				if (isRest) {
					if (acc[1]) throw new Error()
					acc[1] = decoder
				}
				else
					acc[0].push(createOptional(isOptional, decoder))

				return acc
			}, [[], undefined] as [ts.Expression[], ts.Expression | undefined])

			return spreadArg
				? createCombinatorCall('spread', [ts.createArrayLiteral(tupleArgs, false), spreadArg])
				: createCombinatorCall('tuple', tupleArgs)
		}

		case SyntaxKind.UnionType: {
			const node = t as ts.UnionTypeNode
			const types = node.types
			return types.every(type => isLiteral(type))
				? createCombinatorCall('literals', (types as unknown as LiteralNode[]).map(createLiteral))
				: createCombinatorCall('union', types.map(type => decoderForType(type, genericNames, undefined)))
		}

		case SyntaxKind.IntersectionType: {
			const node = t as ts.IntersectionTypeNode
			return createCombinatorCall('intersection', node.types.map(type => decoderForType(type, genericNames, undefined)))
		}

		case SyntaxKind.ParenthesizedType: {
			const node = t as ts.ParenthesizedTypeNode
			return decoderForType(node.type, genericNames, aliasName)
		}

		// OptionalTypeNode and RestTypeNode? I feel like these only make sense in objects and tuples?
		// ConditionalTypeNode
		// InferTypeNode
		// TypeOperatorNode
		// IndexedAccessTypeNode
		// MappedTypeNode

		default:
			// TODO needs to return a Result
			throw new Error("unsupported type")
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

function qualifiedToExpression(typeName: ts.EntityName): ts.Expression {
	return ts.isIdentifier(typeName)
		? typeName
		: ts.createPropertyAccess(
			qualifiedToExpression(typeName.left),
			typeName.right,
		)
}

// TODO should we include an auto decoder for the args of a function? not that hard.
