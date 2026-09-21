/** 带部署前缀的静态资源地址，支持部署在子路径（例如 /demo/） */
export function asset(path: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '') + '/' + path.replace(/^\//, '')
}
