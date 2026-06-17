-- Ensure profile creation trigger on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public."Profile" (id, email, username, "kycStatus", "trustScore", "createdAt", "updatedAt")
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    'PENDING',
    100.0,
    now(),
    now()
  );
  
  -- Create matching Wallet
  INSERT INTO public."Wallet" (id, "profileId", "availableBalance", "frozenBalance", "escrowBalance", "totalBalance", "currency", "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid(),
    new.id,
    0.00,
    0.00,
    0.00,
    0.00,
    'USDT',
    now(),
    now()
  );
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run handle_new_user
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable Row Level Security (RLS)
ALTER TABLE public."Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Wallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WalletAddress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PaymentMethod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Advertisement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Trade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TradeMessage" ENABLE ROW LEVEL SECURITY;

-- Policies for Profile
CREATE POLICY "Allow public read access to active profiles" ON public."Profile"
  FOR SELECT USING (deleted_at IS NULL);

CREATE POLICY "Allow individual update to own profile" ON public."Profile"
  FOR UPDATE USING (auth.uid() = id);

-- Policies for Wallet
CREATE POLICY "Allow owners to view their own wallets" ON public."Wallet"
  FOR SELECT USING (auth.uid() = "profileId");

-- Policies for Advertisements
CREATE POLICY "Allow public read of active advertisements" ON public."Advertisement"
  FOR SELECT USING (status = 'ACTIVE' AND "deletedAt" IS NULL);

CREATE POLICY "Allow owners to edit advertisements" ON public."Advertisement"
  FOR ALL USING (auth.uid() = "profileId");

-- Policies for Trade
CREATE POLICY "Allow participants to view trade" ON public."Trade"
  FOR SELECT USING (auth.uid() = "buyerId" OR auth.uid() = "sellerId");
