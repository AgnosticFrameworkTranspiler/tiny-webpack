import * as path from "path";
import * as fs from "fs";
import * as parser from "@babel/parser";
import * as babel from "@babel/core";
import traverse from "@babel/traverse";

const readFileAsync = async (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    fs.readFile(
      filePath,
      {
        encoding: "utf-8",
      },
      (err, data) => {
        if (err) return reject(err);
        return resolve(data);
      }
    );
  });
};

const generateDependency = async (filePath: string): Promise<any> => {
  const content: string = await readFileAsync(filePath);
  const ast = parser.parse(content, {
    sourceType: "module",
  });

  const dependencies: any = {};

  traverse(ast, {
    ImportDeclaration({ node }) {
      const currentPath = path.dirname(filePath);
      const dependencyPath = path.join(currentPath, node.source.value);
      dependencies[node.source.value] = dependencyPath;
    },
  });

  const { code } = await babel.transformFromAstAsync(ast, null, {
    presets: ["@babel/preset-env"],
  });

  return {
    filePath,
    dependencies,
    code,
  };
};

const generateDependencyGraph = async (entryFile: string): Promise<any> => {
  const entryModule = await generateDependency(entryFile);
  const modules = [entryModule];

  for (let i = 0; i < modules.length; i++) {
    const m = modules[i];
    const { dependencies } = m;
    if (dependencies) {
      for (let d in dependencies) {
        modules.push(await generateDependency(dependencies[d]));
      }
    }
  }

  const graph: any = {};
  modules.forEach((m) => {
    graph[m.filePath] = {
      dependencies: m.dependencies,
      code: m.code,
    };
  });

  return graph;
};

const generateCode = async (entryFile: string): Promise<string> => {
  const graph = JSON.stringify(await generateDependencyGraph(entryFile));

  return `
    (function(graph) {
      function require(module) {
        function localRequire(relativePath) {
          return require(graph[module].dependencies[relativePath]);
        }
        var exports = {};
        (function(require, exports, code) {
          eval(code);
        })(localRequire, exports, graph[module].code);

        return exports;
      }
      require('${entryFile}');
    })(${graph});
  `;
};

async function bootstrap(): Promise<void> {
  const code: string = await generateCode(
    path.resolve(__dirname, "../source/index.js")
  );

  eval(code);
}

bootstrap();
