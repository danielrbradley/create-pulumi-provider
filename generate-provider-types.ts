import * as pulumiSchema from "./pulumi-schema";
import * as fs from "fs";
import * as ts from "typescript";
import path = require("path");

const headerWarning = `This file was automatically generated by pulumi-provider-scripts.
DO NOT MODIFY IT BY HAND. Instead, modify the source Pulumi Schema file,
and run "pulumi-provider-scripts gen-provider-types" to regenerate this file.`;

function genTypeProperties(
  properties?: Record<string, pulumiSchema.TypeReference>,
  required?: string[]
): ts.TypeElement[] {
  if (properties === undefined) {
    return [];
  }
  const requiredLookup = new Set(required);
  return Object.entries(properties).map(
    ([propKey, typeDefinition]): ts.TypeElement => {
      const type = (() => {
        switch (typeDefinition.type) {
          case "string":
            return ts.factory.createKeywordTypeNode(
              ts.SyntaxKind.StringKeyword
            );
          case "integer":
          case "number":
            return ts.factory.createKeywordTypeNode(
              ts.SyntaxKind.NumberKeyword
            );
          case "boolean":
            return ts.factory.createKeywordTypeNode(
              ts.SyntaxKind.BooleanKeyword
            );
          case "array":
            return ts.factory.createArrayTypeNode(
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
            );
          case "object":
            return ts.factory.createTypeReferenceNode("Record", [
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
            ]);
        }
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
      })();
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
      return ts.factory.createPropertySignature(
        [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
        propKey,
        requiredLookup.has(propKey)
          ? undefined
          : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        type
      );
    }
  );
}

export function generateProviderTypes(args?: { cwd?: string }) {
  const cwd = args?.cwd;
  const dir = cwd !== undefined ? path.resolve(cwd) : process.cwd();
  const schemaPath = path.join(dir, "schema.json");
  const schemaText = fs.readFileSync(schemaPath, { encoding: "utf-8" });
  const schema: pulumiSchema.PulumiPackageMetaschema = JSON.parse(schemaText);
  const resources = Object.entries(schema.resources ?? {}).map(
    ([typeToken, resource]) => {
      const tokenParts = typeToken.split(":");
      const typeName = tokenParts[2];

      const inputProperties = genTypeProperties(
        resource.inputProperties as any,
        resource.requiredInputs as any
      );
      const inputs = ts.factory.createInterfaceDeclaration(
        undefined,
        [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        typeName + "Inputs",
        undefined,
        undefined,
        inputProperties
      );

      const outputProperties = genTypeProperties(
        resource.properties as any,
        resource.required as any
      );
      const outputs = ts.factory.createInterfaceDeclaration(
        undefined,
        [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        typeName + "Outputs",
        undefined,
        undefined,
        outputProperties
      );

      return [inputs, outputs];
    }
  );

  const nodes = ts.factory.createNodeArray([
    ts.factory.createJSDocComment(headerWarning),
    ...resources.flat(),
  ]);
  const sourceFile = ts.createSourceFile(
    "provider-types.d.ts",
    "",
    ts.ScriptTarget.ES2019,
    undefined,
    ts.ScriptKind.TS
  );

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const result = printer.printList(ts.ListFormat.MultiLine, nodes, sourceFile);

  const definitionsPath = path.join(dir, "provider-types.d.ts");
  fs.writeFileSync(definitionsPath, result);
}
