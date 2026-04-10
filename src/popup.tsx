import { useState } from "react"

import "./style.css"

function IndexPopup() {
  const [data, setData] = useState("")

  return (
    <div className="p-4 w-64 h-96 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <h1 className="text-xl font-bold mb-4">Video AI Assistant</h1>
      <p className="text-sm text-center mb-4">
        Open a Bilibili or YouTube video to use the assistant.
      </p>
      <button
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        onClick={() => window.open(chrome.runtime.getURL("options.html"))}>
        Open Settings
      </button>
    </div>
  )
}

export default IndexPopup
