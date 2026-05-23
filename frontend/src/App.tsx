import { Workspace } from "./features/workspace/components/Workspace";

export default function App() {
  return (
    <main className="min-h-screen p-6 pb-14 font-sans space-y-3">
      <h1 className="text-2xl font-semibold">Splice</h1>
      <Workspace />
    </main>
  );
}
