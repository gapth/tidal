export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        className="inline-flex rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-300 transition hover:border-slate-500 hover:text-white"
        type="submit"
      >
        Sign Out
      </button>
    </form>
  );
}
