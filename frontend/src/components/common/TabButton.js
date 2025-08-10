// frontend/src/components/common/TabButton.js
// Reusable tab button component

import React from "react";

const TabButton = ({ id, icon: Icon, label, isActive, onClick }) => (
  <button
    onClick={() => onClick(id)}
    className={`tournament-tab ${isActive ? "active" : ""}`}
  >
    <Icon className="w-5 h-5" />
    <span>{label}</span>
  </button>
);

export default TabButton;