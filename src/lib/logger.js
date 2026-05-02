import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_DIR = path.join(__dirname, '..', '..', 'logs')
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.entries(meta)
      .filter(([k]) => k !== 'service')
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ')
    let line = `${timestamp} [${level.toUpperCase().padEnd(5)}] ${message}`
    if (metaStr) line += `  ${metaStr}`
    if (stack) line += `\n${stack}`
    return line
  })
)

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'http',
  defaultMeta: { service: 'zxmoney' },
  transports: [
    new winston.transports.Console({ format: consoleFormat, handleExceptions: true, handleRejections: true }),
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '30d',
      auditFile: path.join(LOG_DIR, '.app-audit.json'),
      format: fileFormat,
      handleExceptions: true,
      handleRejections: true,
    }),
    new DailyRotateFile({
      level: 'error',
      filename: path.join(LOG_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '60d',
      auditFile: path.join(LOG_DIR, '.error-audit.json'),
      format: fileFormat,
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
})

export default logger
