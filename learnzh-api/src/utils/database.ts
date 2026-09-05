import { PrismaClient } from '@prisma/client'
import logger from './logger'

const prisma = new PrismaClient()

prisma.$on('error', (e) => {
  logger.error('Prisma Error: ' + e.message)
})

export default prisma
