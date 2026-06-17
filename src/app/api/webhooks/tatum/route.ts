import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-tatum-secret');
    const expectedSecret = process.env.TATUM_WEBHOOK_SECRET;

    // Signature verification (if configured)
    if (expectedSecret && signature !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized signature' }, { status: 401 });
    }

    const payload = await request.json();
    
    // Tatum TRON TRC20 webhook payload layout
    // Format: { address: '...', amount: '...', txId: '...', chain: 'TRON', asset: 'USDT', confirmations: 1 }
    const { address, amount, txId, asset, confirmations } = payload;

    if (!address || !amount || !txId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (asset !== 'USDT') {
      return NextResponse.json({ message: 'Ignored non-USDT deposit' }, { status: 200 });
    }

    // Check transaction idempotency
    const existingDeposit = await prisma.deposit.findUnique({
      where: { txHash: txId },
    });

    if (existingDeposit && existingDeposit.status === 'COMPLETED') {
      return NextResponse.json({ message: 'Deposit already processed' }, { status: 200 });
    }

    // Find the wallet owner associated with the deposit address
    const dbAddress = await prisma.walletAddress.findUnique({
      where: { address },
      include: { wallet: true },
    });

    if (!dbAddress) {
      return NextResponse.json({ error: 'Address not associated with any system wallet' }, { status: 404 });
    }

    const depositAmount = new Decimal(amount.toString());

    // Update balances and log transaction
    await prisma.$transaction(async (tx) => {
      // Upsert Deposit
      await tx.deposit.upsert({
        where: { txHash: txId },
        update: {
          confirmations: Number(confirmations || 0),
          status: 'COMPLETED',
        },
        create: {
          walletId: dbAddress.walletId,
          amount: depositAmount,
          address,
          txHash: txId,
          confirmations: Number(confirmations || 0),
          status: 'COMPLETED',
        },
      });

      // Update wallet balance
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { id: dbAddress.walletId },
      });

      await tx.wallet.update({
        where: { id: dbAddress.walletId },
        data: {
          availableBalance: { increment: depositAmount },
          totalBalance: { increment: depositAmount },
        },
      });

      // Record transaction history
      await tx.transaction.create({
        data: {
          walletId: dbAddress.walletId,
          amount: depositAmount,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          txHash: txId,
          description: `Deposited ${depositAmount} USDT (TRC20) to address ${address}`,
        },
      });
    });

    return NextResponse.json({ success: true, message: 'Deposit credited successfully' });
  } catch (error: any) {
    console.error('Tatum deposit webhook error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
