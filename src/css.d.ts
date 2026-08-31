// CSS 文件用 esbuild text loader 注入,需要这个 ambient declaration 让 TypeScript 接受
declare module '*.css' {
  const content: string;
  export default content;
}
