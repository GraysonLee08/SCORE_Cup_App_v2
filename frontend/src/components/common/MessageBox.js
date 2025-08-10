// frontend/src/components/common/MessageBox.js
// Reusable message display component

import React from "react";

const MessageBox = ({ error, success }) => {
  if (!error && !success) return null;

  return (
    <div
      className={`p-4 rounded-lg mb-6 ${
        error
          ? "bg-red-50 border border-red-200 text-red-700"
          : "bg-green-50 border border-green-200 text-green-700"
      }`}
    >
      <div className="flex items-center">
        {error ? "❌" : "✅"} {error || success}
      </div>
    </div>
  );
};

export default MessageBox;