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
		// return decodableForClass(ctx, statement, isExported)
		throw new Error()
	if (ts.isInterfaceDeclaration(statement))
		return decodableForInterface(ctx, statement, isExported)

	return ctx.TsNodeErr(statement, 'Invalid statement', `The "decodable" macro can only be used on type aliases, classes, and interfaces.`)
})

function decodableForTypeAlias(ctx: MacroContext, alias: ts.TypeAliasDeclaration, isExported: boolean): DecoratorMacroResult {
	return ctx.Ok({
		replacement: alias,
		append: [
			alias.typeParameters
				? createGenericDecoderModule(isExported, alias.name, alias.typeParameters, alias.type, undefined)
				: createConcreteDecoderModule(isExported, alias.name, alias.typeParameters, alias.type, undefined)
		],
	})
}

// function decodableForClass(ctx: MacroContext, declaration: ts.ClassDeclaration): DecoratorMacroResult {
// 	throw new Error()
// }

function decodableForInterface(ctx: MacroContext, declaration: ts.InterfaceDeclaration, isExported: boolean): DecoratorMacroResult {
	// name
	// typeParameters?
	// heritageClauses?: ts.NodeArray<{ types: NodeArray<ExpressionWithTypeArguments> }>
	// members: ts.NodeArray<{ name?: PropertyName, questionToken?: QuestionToken }> but we have to narrow them :(

	throw new Error()
}



function createGenericDecoderModule(
	isExported: boolean, name: ts.Identifier,
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

	return ts.createModuleDeclaration(
		undefined, conditionalExport(isExported), name,
		ts.createModuleBlock([
			ts.createFunctionDeclaration(
				undefined, exportModifers, undefined, ts.createIdentifier('decoder'),
				typeParameters, parameters, undefined,
				ts.createBlock([ts.createReturn(
					intersectOrNot(decoderForType(type, genericNames), intersections),
				)], true),
			),
		]), ts.NodeFlags.Namespace,
	)
}

function createConcreteDecoderModule(
	isExported: boolean, name: ts.Identifier,
	typeParameters: undefined, type: ts.TypeNode,
	intersections: ts.Expression[] | undefined,
) {
	return ts.createModuleDeclaration(
		undefined, conditionalExport(isExported), name,
		ts.createModuleBlock([
			ts.createVariableStatement(
				exportModifers,
				ts.createVariableDeclarationList([
					ts.createVariableDeclaration(
						ts.createIdentifier('decoder'), undefined,
						intersectOrNot(decoderForType(type, undefined), intersections),
					),
				], ts.NodeFlags.Const),
			),
		]), ts.NodeFlags.Namespace,
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
	[SyntaxKind.BigIntKeyword]: 'big',
	[SyntaxKind.ObjectKeyword]: 'object',
	[SyntaxKind.SymbolKeyword]: 'symbol',
	[SyntaxKind.UndefinedKeyword]: 'undefined',
	[SyntaxKind.VoidKeyword]: 'void',
	[SyntaxKind.UnknownKeyword]: 'unknown',
	[SyntaxKind.NeverKeyword]: 'never',
	[SyntaxKind.AnyKeyword]: 'any',
}

function decoderForType(t: ts.TypeNode, generics: Set<string> | undefined): ts.Expression {
	const genericNames = generics || new Set()
	// if a TypeReferenceNode is in genericNames, then we just pass the name along directly
	// otherwise we make it name.decoder
	switch (t.kind) {
		case SyntaxKind.BooleanKeyword: case SyntaxKind.StringKeyword:
		case SyntaxKind.NumberKeyword: case SyntaxKind.BigIntKeyword:
		case SyntaxKind.ObjectKeyword: case SyntaxKind.SymbolKeyword:
		case SyntaxKind.UndefinedKeyword: case SyntaxKind.VoidKeyword:
		case SyntaxKind.UnknownKeyword: case SyntaxKind.NeverKeyword: case SyntaxKind.AnyKeyword:
			return ts.createPropertyAccess(ts.createIdentifier('c'), ts.createIdentifier(primitiveMap[t.kind]))

		// SyntaxKind.TypeReference

		// TypeLiteralNode
		// ArrayTypeNode
		// TupleTypeNode
		// OptionalTypeNode
		// RestTypeNode
		// UnionTypeNode
		// IntersectionTypeNode
		// ConditionalTypeNode
		// InferTypeNode
		// ParenthesizedTypeNode
		// TypeOperatorNode
		// IndexedAccessTypeNode
		// MappedTypeNode
		// LiteralTypeNode

		default:
			throw new Error("unsupported type")
	}
}

// TODO should we include an auto decoder for the args of a function? not that hard.
