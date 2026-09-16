import {
  ArrowDownToLine, ArrowUpFromLine, BadgeDollarSign, Banknote, BookOpen, CircleDollarSign,
  CircleHelp, CreditCard, Gift, Headphones, HelpCircle, Info, Landmark, LockKeyhole,
  MessageCircle, Settings, ShieldCheck, Smartphone, Sparkles, Target, Trophy, User, Wallet,
  type LucideIcon, type LucideProps,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  target: Target, wallet: Wallet, creditcard: CreditCard, credit_card: CreditCard, landmark: Landmark,
  bank: Landmark, banknote: Banknote, shield: ShieldCheck, shieldcheck: ShieldCheck, security: ShieldCheck,
  gift: Gift, info: Info, circledollarsign: CircleDollarSign, money: CircleDollarSign,
  badgedollarsign: BadgeDollarSign, deposit: ArrowDownToLine, withdrawal: ArrowUpFromLine,
  user: User, account: User, lock: LockKeyhole, trophy: Trophy, bonus: Gift, sparkles: Sparkles,
  messagecircle: MessageCircle, support: Headphones, headphones: Headphones, smartphone: Smartphone,
  settings: Settings, bookopen: BookOpen, guide: BookOpen, helpcircle: CircleHelp, help: HelpCircle,
};

function iconKey(value: string) { return String(value || "").replace(/[^a-z0-9_]/gi, "").toLowerCase(); }

export function CategoryIcon({ name, url, className, ...props }: { name: string; url?: string } & LucideProps) {
  const safeUrl = String(url || "").trim();
  if (safeUrl && (safeUrl.startsWith("/") || /^https?:\/\//i.test(safeUrl))) {
    return <img src={safeUrl} alt="" className={className} style={{ objectFit: "contain" }} />;
  }
  const Icon = ICONS[iconKey(name)] ?? HelpCircle;
  return <Icon className={className} {...props} />;
}
