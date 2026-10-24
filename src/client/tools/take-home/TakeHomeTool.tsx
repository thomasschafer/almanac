import { Route, Routes } from "react-router";
import { TakeHomeContext, useTakeHomeValue } from "./context.tsx";
import { StudentLoansPage } from "./StudentLoansPage.tsx";
import { TakeHomePage } from "./TakeHomePage.tsx";

/** The take-home tool: its state and calculations, shared by its pages. */
export default function TakeHomeTool() {
  const value = useTakeHomeValue();
  return (
    <TakeHomeContext value={value}>
      <Routes>
        <Route index element={<TakeHomePage />} />
        <Route path="student-loans" element={<StudentLoansPage />} />
      </Routes>
    </TakeHomeContext>
  );
}
