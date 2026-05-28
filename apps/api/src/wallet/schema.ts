import { z } from 'zod'

// Deposito: cliente so escolhe o valor. A conta creditada e sempre a REAL do usuario.
export const createDepositSchema = z.object({
  amount: z.number().positive().min(
    Number(process.env.MIN_DEPOSIT ?? '10'),
    `Valor minimo de deposito e R$${process.env.MIN_DEPOSIT ?? '10'}`,
  ),
})
export type CreateDepositInput = z.infer<typeof createDepositSchema>

// Saque: valor + chave Pix de destino. Tipos aceitos batem com o CHECK da tabela withdrawals.
export const createWithdrawalSchema = z.object({
  amount: z.number().positive().min(
    Number(process.env.MIN_WITHDRAWAL ?? '20'),
    `Valor minimo de saque e R$${process.env.MIN_WITHDRAWAL ?? '20'}`,
  ),
  pixKeyType: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random']),
  pixKey:     z.string().min(1).max(140),
})
export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>
