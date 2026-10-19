import { redirect } from "next/navigation";
export default async function NewExpense({ searchParams }: { searchParams: Promise<{edit?: string}> }) {
  const { edit } = await searchParams;
  redirect(edit && /^[0-9a-f-]{36}$/i.test(edit) ? `/expenses/list?edit=${edit}` : "/expenses/list?create=1");
}
