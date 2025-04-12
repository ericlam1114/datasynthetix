"use client";

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A simple component for displaying JSON data in a readable format
 * with collapsible sections
 */
export function JsonView({ data, className }) {
  // Handle null or undefined data
  if (data === null || data === undefined) {
    return <div className={cn("text-muted-foreground", className)}>null</div>;
  }

  // If data is a primitive type (string, number, boolean), render it directly
  if (typeof data !== 'object') {
    return (
      <div className={cn("font-mono", className)}>
        {typeof data === 'string' ? `"${data}"` : String(data)}
      </div>
    );
  }

  return <JsonObject data={data} className={className} />;
}

/**
 * Component for displaying JSON objects with collapsible sections
 */
function JsonObject({ data, className, depth = 0 }) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const isArray = Array.isArray(data);
  const isEmpty = Object.keys(data).length === 0;
  const indentation = depth * 16; // 16px per level of depth

  // For empty objects/arrays
  if (isEmpty) {
    return (
      <div className={cn("font-mono", className)}>
        {isArray ? "[]" : "{}"}
      </div>
    );
  }

  return (
    <div className={cn("font-mono text-sm", className)}>
      <div className="flex items-center">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-4 h-4 mr-1 text-muted-foreground hover:text-foreground focus:outline-none"
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? "▼" : "►"}
        </button>
        <span>{isArray ? "[" : "{"}</span>
        {!isExpanded && (
          <span className="text-muted-foreground">
            {isArray ? `${Object.keys(data).length} items` : "..."}
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="ml-4">
          {Object.entries(data).map(([key, value], index) => (
            <div key={key} className="my-1">
              <div className="flex">
                <span className="text-blue-500 dark:text-blue-400">
                  {isArray ? "" : `"${key}": `}
                </span>
                {typeof value === "object" && value !== null ? (
                  <JsonObject data={value} depth={depth + 1} />
                ) : (
                  <JsonValue value={value} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>{isArray ? "]" : "}"}</div>
    </div>
  );
}

/**
 * Component for displaying JSON primitive values with appropriate styling
 */
function JsonValue({ value }) {
  if (value === null) {
    return <span className="text-gray-500">null</span>;
  }

  switch (typeof value) {
    case "string":
      return <span className="text-green-600 dark:text-green-400">"{value}"</span>;
    case "number":
      return <span className="text-amber-600 dark:text-amber-400">{value}</span>;
    case "boolean":
      return <span className="text-purple-600 dark:text-purple-400">{String(value)}</span>;
    default:
      return <span>{String(value)}</span>;
  }
} 