import { GooeyLoader } from "@/components/ui/loader-10";

export default function GooeyLoaderDemo() {
  return (
    <div className="flex min-h-[250px] w-full items-center justify-center">
      <GooeyLoader
        primaryColor="#f87171"
        secondaryColor="#fca5a5"
        borderColor="#e5e7eb"
      />
    </div>
  );
}
