import { MessageCircle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslation } from "../i18n/useTranslation"

interface Props {
    isOpen: boolean
    onClick: () => void
}

export function ToggleButton({ isOpen, onClick }: Props) {
    const { t } = useTranslation()
    return (
        <AnimatePresence>
            {!isOpen && (
                <motion.button
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onClick}
                    style={{ zIndex: 2147483647 }}
                    title={t("toggleButton.open")}
                    className="fixed right-6 bottom-20 p-3 rounded-full shadow-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors duration-200"
                >
                    <MessageCircle size={24} />
                </motion.button>
            )}
        </AnimatePresence>
    )
}
