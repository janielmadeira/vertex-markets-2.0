import bcrypt from 'bcryptjs'
import { prisma } from '../prisma.js'
import type { RegisterInput, LoginInput } from './schema.js'

const DEMO_INITIAL_BALANCE = parseFloat(process.env.DEMO_INITIAL_BALANCE ?? '10000')

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new Error('EMAIL_TAKEN')

  const hashed = await bcrypt.hash(input.password, 12)

  const user = await prisma.user.create({
    data: {
      name:     input.name,
      email:    input.email,
      password: hashed,
      phone:    input.phone,
      country:  input.country,
      accounts: {
        create: [
          // Demo account with initial balance
          { type: 'DEMO', balance: DEMO_INITIAL_BALANCE, currency: 'BRL' },
          // Real account starts at 0
          { type: 'REAL', balance: 0,                    currency: 'BRL' },
        ],
      },
    },
    select: {
      id: true, name: true, email: true, kycStatus: true, createdAt: true,
      accounts: { select: { id: true, type: true, balance: true, currency: true } },
    },
  })

  return user
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: {
      accounts: { select: { id: true, type: true, balance: true, currency: true } },
    },
  })

  if (!user) throw new Error('INVALID_CREDENTIALS')

  const valid = await bcrypt.compare(input.password, user.password)
  if (!valid) throw new Error('INVALID_CREDENTIALS')

  const { password: _, ...safeUser } = user
  return safeUser
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, phone: true, country: true,
      kycStatus: true, createdAt: true,
      accounts: { select: { id: true, type: true, balance: true, currency: true } },
    },
  })
  if (!user) throw new Error('USER_NOT_FOUND')
  return user
}
