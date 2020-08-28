// import * as ts from 'typescript'
// import { DecoratorMacro } from '@blainehansen/macro-ts'
// // import { SpanResult } from '@blainehansen/macro-ts/dist/node-latest/lib/message'
// import { MacroContext } from '@blainehansen/macro-ts/dist/node-latest/lib/transformer'

// export const decodable = DecoratorMacro((ctx, statement) => {
// 	if (ts.isTypeAliasDeclaration(statement))
// 		return decodableForType(ctx, statement)
// 	if (ts.isClassDeclaration(statement))
// 		return decodableForClass(ctx, statement)
// 	if (ts.isInterfaceDeclaration(statement))
// 		return decodableForInterface(ctx, statement)

// 	return ctx.TsNodeErr(statement, 'Invalid statement', `The "decodable" macro can only be used on type aliases, classes, and interfaces.`)
// })

// function decodableForType(ctx: MacroContext, alias: ts.TypeAliasDeclaration): ReturnType<DecoratorMacro> {
// 	if (alias.typeParameters) ctx.tsNodeWarn(alias.typeParameters, "Can't handle generics yet", "agghg")

// 	//
// }

// function computeDecoderForType(t: ts.TypeNode): ts.Expression {
// 	switch (t.kind) {
// 		case SyntaxKind.BooleanKeyword:
// 		case SyntaxKind.NumberKeyword:
// 		case SyntaxKind.StringKeyword:
// 		case SyntaxKind.BigIntKeyword:
// 		case SyntaxKind.ObjectKeyword:
// 		case SyntaxKind.SymbolKeyword:
// 		case SyntaxKind.UndefinedKeyword: case SyntaxKind.VoidKeyword:
// 		case SyntaxKind.UnknownKeyword:
// 		case SyntaxKind.NeverKeyword:
// 		case SyntaxKind.AnyKeyword:

// 		TypeLiteralNode
// 		ArrayTypeNode
// 		TupleTypeNode
// 		OptionalTypeNode
// 		RestTypeNode
// 		UnionTypeNode
// 		IntersectionTypeNode
// 		ConditionalTypeNode
// 		InferTypeNode
// 		ParenthesizedTypeNode
// 		TypeOperatorNode
// 		IndexedAccessTypeNode
// 		MappedTypeNode
// 		LiteralTypeNode
// 	}
// }

// function decodableForClass(ctx: MacroContext, declaration: ts.ClassDeclaration): ReturnType<DecoratorMacro> {
// 	throw new Error()
// }

// function decodableForInterface(ctx: MacroContext, declaration: ts.InterfaceDeclaration): ReturnType<DecoratorMacro> {
// 	throw new Error()
// }

// // should we include an auto decoder for the args of a function? not that hard.


// type A<T> = { name: string, value: T }

