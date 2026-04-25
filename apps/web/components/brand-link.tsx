import Link from "next/link";

type BrandLinkProps = {
  className?: string;
};

export function BrandLink({ className }: BrandLinkProps) {
  return (
    <Link
      className={
        className ??
        "text-sm uppercase tracking-[0.3em] text-cyan-400 transition hover:text-cyan-300"
      }
      href="/"
    >
      Tidal
    </Link>
  );
}
