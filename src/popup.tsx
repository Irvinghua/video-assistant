import { I18nProvider } from "./i18n/I18nProvider"
import { useTranslation } from "./i18n/useTranslation"

import "./style.css"

function PopupBody() {
  const { t } = useTranslation()
  return (
    <div className="p-4 w-64 h-96 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <h1 className="text-xl font-bold mb-4">{t("popup.title")}</h1>
      <p className="text-sm text-center mb-4">{t("popup.description")}</p>
      <button
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        onClick={() => window.open(chrome.runtime.getURL("options.html"))}>
        {t("popup.openSettings")}
      </button>
    </div>
  )
}

function IndexPopup() {
  return (
    <I18nProvider>
      <PopupBody />
    </I18nProvider>
  )
}

export default IndexPopup
