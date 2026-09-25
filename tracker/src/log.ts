const debugEnabled = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

const stamp = () => new Date().toISOString();

export const log = {
  debug: (msg: string) => debugEnabled && console.debug(`${stamp()} DEBUG ${msg}`),
  info: (msg: string) => console.info(`${stamp()} INFO  ${msg}`),
  warn: (msg: string) => console.warn(`${stamp()} WARN  ${msg}`),
  error: (msg: string, err?: unknown) => console.error(`${stamp()} ERROR ${msg}`, err ?? ''),
};
