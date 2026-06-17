import { prisma } from './prisma';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Move a seller's Available Balance to Escrow Balance
 */
export async function lockFundsIntoEscrow(profileId: string, amount: Decimal) {
  return await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findFirst({
      where: { profileId, currency: 'USDT' },
    });

    if (!wallet) {
      throw new Error(`Wallet not found for profile ${profileId}`);
    }

    const available = new Decimal(wallet.availableBalance.toString());
    if (available.lessThan(amount)) {
      throw new Error('Insufficient available balance to lock in escrow');
    }

    return await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalance: { decrement: amount },
        escrowBalance: { increment: amount },
      },
    });
  });
}

/**
 * Release locked Escrow Balance from seller to buyer's Available Balance
 */
export async function releaseEscrowToBuyer(tradeId: string) {
  return await prisma.$transaction(async (tx) => {
    const trade = await tx.trade.findUnique({
      where: { id: tradeId },
      include: { advertisement: true },
    });

    if (!trade) {
      throw new Error(`Trade not found with ID ${tradeId}`);
    }

    if (trade.status !== 'PAID' && trade.status !== 'OPEN' && trade.status !== 'DISPUTED') {
      throw new Error(`Invalid trade status ${trade.status} for escrow release`);
    }

    const sellerWallet = await tx.wallet.findFirst({
      where: { profileId: trade.sellerId, currency: 'USDT' },
    });

    const buyerWallet = await tx.wallet.findFirst({
      where: { profileId: trade.buyerId, currency: 'USDT' },
    });

    if (!sellerWallet || !buyerWallet) {
      throw new Error('Seller or Buyer wallet not found');
    }

    const tradeAmount = new Decimal(trade.amount.toString());

    // Deduct from seller's escrow and total balance
    await tx.wallet.update({
      where: { id: sellerWallet.id },
      data: {
        escrowBalance: { decrement: tradeAmount },
        totalBalance: { decrement: tradeAmount },
      },
    });

    // Credit to buyer's available and total balance
    await tx.wallet.update({
      where: { id: buyerWallet.id },
      data: {
        availableBalance: { increment: tradeAmount },
        totalBalance: { increment: tradeAmount },
      },
    });

    // Update trade status
    const updatedTrade = await tx.trade.update({
      where: { id: tradeId },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
      },
    });

    // Record transactions
    await tx.transaction.createMany({
      data: [
        {
          walletId: sellerWallet.id,
          amount: tradeAmount,
          type: 'ESCROW_RELEASE',
          status: 'COMPLETED',
          description: `Released ${tradeAmount} USDT to buyer ${trade.buyerId} for trade ${trade.id}`,
        },
        {
          walletId: buyerWallet.id,
          amount: tradeAmount,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          description: `Received ${tradeAmount} USDT from seller ${trade.sellerId} for trade ${trade.id}`,
        },
      ],
    });

    return updatedTrade;
  });
}

/**
 * Refund locked Escrow Balance back to seller's Available Balance
 */
export async function refundEscrowToSeller(tradeId: string) {
  return await prisma.$transaction(async (tx) => {
    const trade = await tx.trade.findUnique({
      where: { id: tradeId },
    });

    if (!trade) {
      throw new Error(`Trade not found with ID ${tradeId}`);
    }

    if (trade.status !== 'DISPUTED' && trade.status !== 'OPEN' && trade.status !== 'PAID') {
      throw new Error(`Invalid trade status ${trade.status} for escrow refund`);
    }

    const sellerWallet = await tx.wallet.findFirst({
      where: { profileId: trade.sellerId, currency: 'USDT' },
    });

    if (!sellerWallet) {
      throw new Error('Seller wallet not found');
    }

    const tradeAmount = new Decimal(trade.amount.toString());

    // Move seller's escrow back to available balance
    await tx.wallet.update({
      where: { id: sellerWallet.id },
      data: {
        escrowBalance: { decrement: tradeAmount },
        availableBalance: { increment: tradeAmount },
      },
    });

    // Update trade status
    const updatedTrade = await tx.trade.update({
      where: { id: tradeId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    // Record transactions
    await tx.transaction.create({
      data: {
        walletId: sellerWallet.id,
        amount: tradeAmount,
        type: 'ESCROW_REFUND',
        status: 'COMPLETED',
        description: `Refunded ${tradeAmount} USDT from trade ${trade.id} back to available balance`,
      },
    });

    return updatedTrade;
  });
}
