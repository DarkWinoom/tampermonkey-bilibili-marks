// markdownlint-cli2 配置:限定扫哪些文件,排除依赖/产物/AI 内部文档
module.exports = {
  globs: ["**/*.md"],
  ignores: ["node_modules/**", "dist/**", "coverage/**", ".agents-docs/**"],
};
