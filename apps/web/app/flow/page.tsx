import { redirect } from "next/navigation";

// The interactive storyboard page got too easy to confuse with the real onchain demo.
// Keep the hackathon surface area small: /flow now redirects to the one-button demo.
export default function FlowPage() {
  redirect("/demo");
}

