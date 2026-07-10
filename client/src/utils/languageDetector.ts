/**
 * Detects the Monaco editor language mode based on the file extension.
 * Supported mappings: .html, .css, .js, .ts, .jsx, .tsx, .json, .py, .md, .txt
 */
export function detectLanguage(filename: string): string {
  const parts = filename.split('.');
  if (parts.length <= 1) return 'plaintext';

  const ext = parts.pop()?.toLowerCase();

  switch (ext) {
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'json':
      return 'json';
    case 'py':
      return 'python';
    case 'md':
      return 'markdown';
    case 'txt':
      return 'plaintext';
    default:
      return 'plaintext';
  }
}
