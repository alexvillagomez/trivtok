import Home from "@/components/Home";
import Profile from "@/components/Profile";

export const dynamic = "force-dynamic";

// Server component. Loads NOTHING from the DB: every card comes from
// next_question() one swipe at a time (~130 bytes out), so no question data —
// least of all embeddings — is egressed at page load.
// <Home/> first so <Profile/> (and the "Change interests" picker it opens)
// paint above the feed — the picker overlay relies on later DOM order to stack.
export default function Page() {
  return (
    <>
      <Home />
      <Profile />
    </>
  );
}
