import * as ts from 'typescript'
const SyntaxKind = ts.SyntaxKind
import { Result, Ok, Err } from '@blainehansen/monads'
import { MacroContext, DecoratorMacro, DecoratorMacroResult } from '@blainehansen/macro-ts'

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

export const validator = DecoratorMacro((ctx, statement) => {
	const isExported = isNodeExported(statement)
	if (ts.isTypeAliasDeclaration(statement))
		return validatorForTypeAlias(ctx, statement, isExported)
	if (ts.isClassDeclaration(statement))
		return validatorForClass(ctx, statement, isExported)
	if (ts.isInterfaceDeclaration(statement))
		return validatorForInterface(ctx, statement, isExported)
	if (ts.isEnumDeclaration(statement))
		return validatorForEnum(ctx, statement, isExported)
	if (ts.isFunctionDeclaration(statement))
		return validatorForFunction(ctx, statement, isExported)

	return ctx.TsNodeErr(statement, "Unsupported statement", `The "validator" macro can only be used on type aliases, classes, and interfaces.`)
})

const namespaceIdent = () => ts.createIdentifier('v')

function validatorForTypeAlias(ctx: MacroContext, alias: ts.TypeAliasDeclaration, isExported: boolean): DecoratorMacroResult {
	const genericNames = produceGenericNames(alias.typeParameters)
	const originalAlias = createGenericAlias(alias.name, alias.typeParameters)
	const validator = validatorForType(ctx, alias.type, genericNames, originalAlias, alias.name.text)
	if (validator.isErr()) return ctx.TsNodeErr(...validator.error)

	return ctx.Ok({
		replacement: alias,
		append: [createValidatorModule(isExported, alias.name, alias.typeParameters, validator.value, originalAlias.type)],
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

function validatorForInterface(ctx: MacroContext, declaration: ts.InterfaceDeclaration, isExported: boolean): DecoratorMacroResult {
	const topName = declaration.name.text
	const genericNames = produceGenericNames(declaration.typeParameters)
	const intersections = declaration.heritageClauses
		? intersectionsFromHeritageClauses(ctx, declaration.heritageClauses, genericNames, topName)
		: undefined
	const originalAlias = createGenericAlias(declaration.name, declaration.typeParameters)
	const validator = validatorForType(
		ctx, ts.createTypeLiteralNode(declaration.members), genericNames,
		intersections ? undefined : originalAlias, topName,
	)
	if (validator.isErr()) return ctx.TsNodeErr(...validator.error)

	return ctx.Ok({
		replacement: declaration,
		append: [createValidatorModule(
			isExported, declaration.name, declaration.typeParameters,
			intersectOrNot(validator.value, intersections), originalAlias.type,
		)],
	})
}


// look for the constructor, and if it exists simply make the validator for the parameters with a wrapper
// if it doesn't exist then look for an extends heritage, and just use the validator for that, since the constructor must be derived
// if that doesn't exist then make a trivial validator that just creates the thing???
// no probably the only reasonable thing to do here is to error. we should be forcing people to use a class convention that is actually reasonable to validate! maybe you can get fancy in the future, but for now keep it simple
function validatorForClass(ctx: MacroContext, declaration: ts.ClassDeclaration, isExported: boolean): DecoratorMacroResult {
	if (!declaration.name)
		return ctx.TsNodeErr(declaration, "Invalid Anonymous Class", "Validatable classes must have a name.")

	const genericNames = produceGenericNames(declaration.typeParameters)
	const originalAlias = createGenericAlias(declaration.name, declaration.typeParameters)
	let constructorValidator: ts.Expression | undefined = undefined
	for (const member of declaration.members) switch (member.kind) {
		case SyntaxKind.Constructor: {
			const validatorResult = createValidatorForArgs(ctx, (member as ts.ConstructorDeclaration).parameters, genericNames)
			if (validatorResult.isErr()) return ctx.TsNodeErr(...validatorResult.error)

			const [validator, argsTupleType] = validatorResult.value
			constructorValidator = createCombinatorCall(
				'cls', [argsTupleType, originalAlias.type],
				[declaration.name, validator],
			)
			break
		}
		default: continue
	}
	if (!constructorValidator)
		return ctx.TsNodeErr(declaration.name, "No Constructor", "Validatable classes must have a constructor whose args can be validated.")

	return ctx.Ok({
		replacement: declaration,
		append: [createValidatorModule(isExported, declaration.name, declaration.typeParameters, constructorValidator, originalAlias.type)],
	})
}

function validatorForEnum(ctx: MacroContext, declaration: ts.EnumDeclaration, isExported: boolean): DecoratorMacroResult {
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

	const enumType = ts.createTypeReferenceNode(enumName)
	const validator = createCombinatorCall('wrapEnum', [enumType], [
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
		append: [createValidatorModule(isExported, declaration.name, undefined, validator, enumType)],
	})
}


function validatorForFunction(ctx: MacroContext, declaration: ts.FunctionDeclaration, isExported: boolean): DecoratorMacroResult {
	if (!declaration.name)
		return ctx.TsNodeErr(declaration, "Invalid Anonymous Function", "Validatable functions must have a name.")

	if (declaration.typeParameters && !declaration.type)
		return ctx.TsNodeErr(declaration, "Invalid Generic Function", "Generic validator functions must have their return type annotated.")

	const genericNames = produceGenericNames(declaration.typeParameters)
	const validatorResult = createValidatorForArgs(ctx, declaration.parameters, genericNames)
	if (validatorResult.isErr()) return ctx.TsNodeErr(...validatorResult.error)
	const [argsValidator, argsTupleType] = validatorResult.value
	const returnType = declaration.type
		? declaration.type
		: ts.createTypeReferenceNode(ts.createIdentifier('ReturnType'), [ts.createTypeQueryNode(declaration.name)])
	const funcValidator = createCombinatorCall('func', [argsTupleType, returnType], [declaration.name, argsValidator])

	return ctx.Ok({
		replacement: declaration,
		append: [createValidatorModule(isExported, declaration.name, declaration.typeParameters, funcValidator, returnType, true)],
	})
}


function createValidatorForArgs(
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
			return TsNodeErr(parameter, "No Validatable Type", `The "validate" macro can't create a validator from an inferred type.`)
		const isRest = !!dotDotDotToken
		const result = validatorForType(ctx, type, genericNames, undefined, '')
		if (result.isErr()) return Err(result.error)
		const isOptional = !!questionToken || !!initializer
		const validator = createOptional(isOptional, result.value)
		const finalType = isOptional ? ts.createOptionalTypeNode(type) : type
		if (isRest) {
			spreadArg = validator
			spreadTypeArg = finalType
		}
		else {
			tupleArgs.push(validator)
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


function createValidatorModule(
	isExported: boolean, name: ts.Identifier,
	typeParameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined,
	validatorExpression: ts.Expression,
	validatorType: ts.TypeNode,
	forFunction = false,
) {
	const statement = typeParameters
		? createGenericValidator(typeParameters, validatorExpression, validatorType, forFunction)
		: createConcreteValidator(validatorExpression, validatorType, forFunction)

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

function createGenericValidator(
	typeParameters: ts.NodeArray<ts.TypeParameterDeclaration>,
	validatorExpression: ts.Expression,
	validatorType: ts.TypeNode,
	forFunction: boolean,
) {
	const genericNames = new Set<string>()
	const parameters: ts.ParameterDeclaration[] = []
	for (const typeParameter of typeParameters) {
		genericNames.add(typeParameter.name.text)
		parameters.push(ts.createParameter(
			undefined, undefined, undefined, typeParameter.name, undefined,
			ts.createTypeReferenceNode(
				ts.createQualifiedName(namespaceIdent(), ts.createIdentifier('Validator')),
				[ts.createTypeReferenceNode(typeParameter.name, undefined)],
			), undefined,
		))
	}

	return ts.createFunctionDeclaration(
		undefined, exportModifers, undefined,
		ts.createIdentifier(forFunction ? 'validateCaller' : 'validator'),
		typeParameters, parameters,
		forFunction ? undefined : createValidatorType(validatorType),
		ts.createBlock([ts.createReturn(validatorExpression)], true),
	)
}

function createConcreteValidator(
	validatorExpression: ts.Expression,
	validatorType: ts.TypeNode,
	forFunction: boolean,
) {
	return ts.createVariableStatement(
		exportModifers,
		ts.createVariableDeclarationList([
			ts.createVariableDeclaration(
				ts.createIdentifier(forFunction ? 'validateCaller' : 'validator'),
				forFunction ? undefined : createValidatorType(validatorType),
				validatorExpression
			),
		], ts.NodeFlags.Const),
	)
}

function createValidatorType(typeNode: ts.TypeNode) {
	return ts.createTypeReferenceNode(
		ts.createQualifiedName(namespaceIdent(), ts.createIdentifier('Validator')),
		[typeNode],
	)
}

function intersectOrNot(type: ts.Expression, intersections: ts.Expression[] | undefined) {
	return intersections
		? ts.createCall(
			ts.createPropertyAccess(namespaceIdent(), ts.createIdentifier('intersection')), undefined,
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
function validatorForType(
	ctx: MacroContext,
	typeNode: ts.TypeNode,
	genericNames: Set<string> | undefined,
	originalAlias: GenericAlias | undefined,
	topName: string,
): NodeResult<ts.Expression> {
	switch (typeNode.kind) {
		case SyntaxKind.BooleanKeyword: case SyntaxKind.StringKeyword:
		case SyntaxKind.NumberKeyword: case SyntaxKind.BigIntKeyword:
		case SyntaxKind.UndefinedKeyword: case SyntaxKind.VoidKeyword:
		case SyntaxKind.UnknownKeyword: case SyntaxKind.NeverKeyword:
			return Ok(ts.createPropertyAccess(namespaceIdent(), ts.createIdentifier(primitiveMap[typeNode.kind])))

		// case SyntaxKind.ObjectKeyword: case SyntaxKind.SymbolKeyword:

		case SyntaxKind.TypeReference: {
			const node = typeNode as ts.TypeReferenceNode

			if (!ts.isIdentifier(node.typeName))
				return Ok(useOrCall(
					ctx,
					createValidatorAccess(qualifiedToExpression(node.typeName)),
					node.typeArguments, genericNames, topName,
				))

			const typeName = node.typeName.text
			if (genericNames && genericNames.has(typeName))
				return Ok(node.typeName)

			if (topName === typeName)
				return Ok(createCombinatorCall('recursive', [], [
					ts.createArrowFunction(
						undefined, undefined, [], undefined,
						ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
						useOrCall(ctx, ts.createIdentifier('validator'), node.typeArguments, genericNames, topName)
					),
				]))

			function createWrapCombinator(combinatorName: string, typeNode: ts.TypeNode): NodeResult<ts.Expression> {
				const inner = validatorForType(ctx, typeNode, genericNames, undefined, topName)
				if (inner.isErr()) return inner
				return Ok(createCombinatorCall(combinatorName, node.typeArguments, [inner.value]))
			}

			function keysTypeToExpression(typeNode: ts.TypeNode): ts.Expression[] {
				if (ts.isUnionTypeNode(typeNode))
					return typeNode.types.flatMap(keysTypeToExpression)

				// TODO this could be more lenient, allowing references and TypeQueryNode (typeof operator)
				// we could even allow something like keyof typeof and produce an Object.keys
				// and also a spread of a typeof
				if (!isLiteral(typeNode)) {
					ctx.subsume(ctx.TsNodeErr(typeNode, "Expecting Keys Type", "Can't produce an expression of keys from a type that isn't a literal or a union of literals"))
					return []
				}

				const literal = createLiteral(typeNode)
				if (!(ts.isStringLiteral(literal) || ts.isNumericLiteral(literal))) {
					ctx.subsume(ctx.TsNodeErr(typeNode, "Expecting String or Numeric Literal"))
					return []
				}

				return [literal]
			}

			switch (typeName) {
				case 'Array':
					if (node.typeArguments && node.typeArguments.length === 1)
						return validatorForType(ctx, ts.createArrayTypeNode(node.typeArguments[0]), genericNames, undefined, topName)
					break

				case 'Partial': case 'Required': case 'Readonly': case 'NonNullable':
					if (node.typeArguments && node.typeArguments.length === 1)
						return createWrapCombinator(typeName.toLowerCase(), node.typeArguments[0])
					break

				case 'Dict':
					if (node.typeArguments && node.typeArguments.length === 1)
						return createWrapCombinator('dictionary', node.typeArguments[0])
					break

				// TODO
				// case 'Map':
				// case 'Set':

				case 'Pick': case 'Omit':
					if (node.typeArguments && node.typeArguments.length === 2) {
						const [targetType, keysType] = node.typeArguments
						const inner = validatorForType(ctx, targetType, genericNames, undefined, topName)
						if (inner.isErr()) return inner
						const keys = keysTypeToExpression(keysType)
						return Ok(createCombinatorCall(
							typeName.toLowerCase(), node.typeArguments,
							[inner.value].concat(keys),
						))
					}
					break

				case 'Record':
					if (node.typeArguments && node.typeArguments.length === 2) {
						const [keysType, targetType] = node.typeArguments
						const inner = validatorForType(ctx, targetType, genericNames, undefined, topName)
						if (inner.isErr()) return inner
						const keys = keysTypeToExpression(keysType)
						return Ok(createCombinatorCall(
							typeName.toLowerCase(), node.typeArguments,
							[ts.createArrayLiteral(keys), inner.value],
						))
					}
					break

				// case 'Parameters':
				// 	if (node.typeArguments && node.typeArguments.length === 1 && node.typeArguments[0].isTypeReferenceNode()) {
				// 		//
				// 		return Ok()
				// 	}
				// 	argsValidator
				// case 'ConstructorParameters':
				// 	constructorArgsValidator

				default: break
			}

			return Ok(useOrCall(
				ctx,
				createValidatorAccess(qualifiedToExpression(node.typeName)),
				node.typeArguments, genericNames, topName,
			))
		}

		case SyntaxKind.LiteralType: {
			const node = typeNode as ts.LiteralTypeNode
			switch (node.literal.kind) {
				case SyntaxKind.NullKeyword: case SyntaxKind.TrueKeyword: case SyntaxKind.FalseKeyword:
					return Ok(ts.createPropertyAccess(namespaceIdent(), ts.createIdentifier(primitiveMap[node.literal.kind])))
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

				const validator = validatorForType(ctx, member.type, genericNames, undefined, topName)
				if (validator.isErr()) return Err(validator.error)
				// CallSignatureDeclaration
				// ConstructSignatureDeclaration
				// PropertySignature
				// MethodSignature
				return Ok(ts.createPropertyAssignment(
					member.name,
					createOptional(!!member.questionToken, validator.value),
				))
			})

			const args: ts.Expression[] = [ts.createObjectLiteral(properties, false)]
			if (originalAlias !== undefined)
				args.unshift(ts.createStringLiteral(originalAlias.name))

			return Ok(createCombinatorCall('object', originalAlias ? [originalAlias.type] : [node], args))
		}

		case SyntaxKind.ArrayType: {
			const node = typeNode as ts.ArrayTypeNode
			const validator = validatorForType(ctx, node.elementType, genericNames, undefined, topName)
			if (validator.isErr()) return Err(validator.error)
			return Ok(createCombinatorCall('array', [node.elementType], [validator.value]))
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

				const validator = validatorForType(ctx, actualNode, genericNames, undefined, topName)
				if (validator.isErr()) {
					ctx.subsume(ctx.TsNodeErr(...validator.error))
					continue
				}
				if (isRest) {
					if (spreadArg) {
						ctx.subsume(ctx.TsNodeErr(element, "Duplicate Rest"))
						continue
					}
					spreadArg = validator.value
					spreadTypeArg = actualNode
				}
				else {
					tupleArgs.push(createOptional(isOptional, validator.value))
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
					(types as ts.NodeArray<LocalLiteralType>).map(createLiteral),
				)
				: createCombinatorCall('union', typeArgs, resultMap(
					ctx, types,
					type => validatorForType(ctx, type, genericNames, undefined, topName),
				))

			return Ok(expression)
		}

		case SyntaxKind.IntersectionType: {
			const node = typeNode as ts.IntersectionTypeNode
			return Ok(createCombinatorCall(
				'intersection', [ts.createTupleTypeNode(node.types)],
				resultMap(ctx, node.types, type => validatorForType(ctx, type, genericNames, undefined, topName)),
			))
		}

		case SyntaxKind.ParenthesizedType: {
			const node = typeNode as ts.ParenthesizedTypeNode
			return validatorForType(ctx, node.type, genericNames, originalAlias, topName)
		}

		// case SyntaxKind.FunctionType: {
		// 	const node = typeNode as ts.FunctionTypeNode
		// 	const validatorResult = createValidatorForArgs(ctx, node.parameters, genericNames)
		// 	if (validatorResult.isErr()) return Err(validatorResult.error)
		// 	const [argsValidator, argsTupleType] = validatorResult.value

		// 	const fnIdent = ts.createIdentifier('fn')
		// 	const fnType = originalAlias

		// 	const instantiator = ts.createFunctionExpression(
		// 		undefined, undefined, undefined, node.typeParameters,
		// 		[ts.createParameter(
		// 			undefined, undefined, undefined, fnIdent, undefined,
		// 			originalAlias ? originalAlias.type : node,
		// 			undefined,
		// 		)],
		// 		undefined,
		// 		ts.createBlock([ts.createReturn(
		// 			createCombinatorCall('func', [argsTupleType, node.type], [fnIdent, argsValidator]),
		// 		)], true),
		// 	)
		// 	return Ok(instantiator)
		// }

		// TODO IndexedAccessTypeNode can definitely be done

		// OptionalTypeNode and RestTypeNode? I feel like these only make sense in objects and tuples?
		// ConditionalTypeNode
		// InferTypeNode
		// TypeOperatorNode
		// MappedTypeNode

		default:
			return TsNodeErr(typeNode, "Unsupported Type")
	}
}

function useOrCall(
	ctx: MacroContext,
	target: ts.Expression,
	typeArguments: ts.NodeArray<ts.TypeNode> | undefined,
	genericNames: Set<string> | undefined,
	topName: string,
): ts.Expression {
	return typeArguments
		? ts.createCall(
			target, typeArguments,
			resultMap(
				ctx, typeArguments,
				(typeArgument: ts.TypeNode) => validatorForType(ctx, typeArgument, genericNames, undefined, topName),
			),
		)
		: target
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
function createLiteral(literalType: LocalLiteralType): ts.Expression {
	switch (literalType.kind) {
		case SyntaxKind.UndefinedKeyword:
			return ts.createIdentifier('undefined')
		case SyntaxKind.VoidKeyword:
			return ts.createAsExpression(ts.createIdentifier('undefined'), ts.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword))
		case SyntaxKind.LiteralType:
			return (literalType as ts.LiteralTypeNode).literal
	}
}

function createOptional(isOptional: boolean, validator: ts.Expression) {
	return isOptional ? createCombinatorCall('optional', undefined, [validator]) : validator
}

function createCombinatorCall(
	combinator: string,
	typeArguments: readonly ts.TypeNode[] | undefined,
	args: ts.Expression[]) {
	return ts.createCall(
		ts.createPropertyAccess(namespaceIdent(), ts.createIdentifier(combinator)),
		typeArguments, args,
	)
}

function createValidatorAccess(target: ts.Expression) {
	return ts.createPropertyAccess(target, ts.createIdentifier('validator'))
}

function intersectionsFromHeritageClauses(
	ctx: MacroContext,
	heritageClauses: ts.NodeArray<ts.HeritageClause>,
	genericNames: Set<string> | undefined,
	topName: string,
): ts.Expression[] {
	const expressions: ts.Expression[] = []
	for (const { types } of heritageClauses) for (const { expression, typeArguments } of types) switch (expression.kind) {
		case SyntaxKind.Identifier: {
			const target = createValidatorAccess(expression as ts.Identifier)
			const validator = typeArguments
				? ts.createCall(
					target, undefined,
					resultMap(ctx, typeArguments, typeArgument => validatorForType(ctx, typeArgument, genericNames, undefined, topName))
				)
				: target
			expressions.push(validator)
			break
		}
		default:
			ctx.subsume(ctx.TsNodeErr(expression, "Invalid Heritage Clause", `The "validator" macro can't handle this type.`))
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
