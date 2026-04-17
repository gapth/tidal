import { Suspense } from "react";
import { AuthCallbackHandler } from "@/components/auth-callback-handler";

type AuthCallbackPageProps = {
  searchParams: Promise<{
    code?: string;
    next?: string;
  }>;
};

export default async function AuthCallbackPage({
  searchParams,
}: AuthCallbackPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <Suspense fallback={null}>
      <AuthCallbackHandler
        code={resolvedSearchParams.code ?? null}
        next={resolvedSearchParams.next ?? null}
      />
    </Suspense>
  );
}
