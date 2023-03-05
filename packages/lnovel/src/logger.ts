import { pino } from 'pino';

export function useLogger(name: string) {
  return pino({
    name,
    base: {
      pid: undefined,
      hostname: undefined
    },
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  });
}
