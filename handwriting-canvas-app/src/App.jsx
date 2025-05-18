import React from "react";
import { BrowserRouter as Router, Route, Switch } from "react-router-dom";
import HandwritingCanvas from "./pages/HandwritingCanvas";
import "./styles/handwriting.css";

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-emerald-50 dark:from-neutral-900 dark:to-neutral-800 p-6 text-neutral-900 dark:text-neutral-100">
        <h1 className="text-3xl font-bold">手写画布应用</h1>
        <Switch>
          <Route path="/" component={HandwritingCanvas} />
        </Switch>
      </div>
    </Router>
  );
}