import React from "react";

const OPTIONS = [
  ["auto", "Auto"],
  ["tablet", "Tablet"],
  ["phone", "Phone"],
];

export default function DeviceLayoutControl({ value, onChange }) {
  return (
    <div className="device-layout-control" aria-label="Device layout">
      <span>Layout</span>
      <div role="group" aria-label="Choose a layout for this device">
        {OPTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={value === id ? "active" : "secondary"}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
