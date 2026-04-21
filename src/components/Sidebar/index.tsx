import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, FileText, MessageSquare, Bot, Network } from "lucide-react"
import type { IPlatformService } from "../../services/platform/types"
import { VideoProvider, useVideo } from "../../contexts/VideoContext"
import { useTranslation } from "../../i18n/useTranslation"
import { LanguageSwitcher } from "../LanguageSwitcher"
import { SummaryPanel } from "./SummaryPanel"
import { CommentsPanel } from "./CommentsPanel"
import { AskAIPanel } from "./AskAIPanel"
import { MindMapPanel } from "./MindMapPanel"

interface Props {
    service: IPlatformService
    isOpen: boolean
    onClose: () => void
}

type Tab = "summary" | "comments" | "chat" | "mindmap"

function SidebarContent({ activeTab, setActiveTab, onClose }: {
    activeTab: Tab
    setActiveTab: (tab: Tab) => void
    onClose: () => void
}) {
    const { videoInfo } = useVideo()
    const { t } = useTranslation()

    return (
        <>
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900 gap-2">
                <h2 className="font-bold text-gray-800 dark:text-gray-100 truncate flex-1 text-sm">
                    {videoInfo?.title || t("sidebar.defaultTitle")}
                </h2>
                <LanguageSwitcher variant="compact" />
                <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 transition-colors" title={t("common.close")}>
                    <X size={20} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-800">
                <TabButton active={activeTab === "summary"} onClick={() => setActiveTab("summary")} icon={<FileText size={18} />} label={t("sidebar.tabs.summary")} />
                <TabButton active={activeTab === "comments"} onClick={() => setActiveTab("comments")} icon={<MessageSquare size={18} />} label={t("sidebar.tabs.comments")} />
                <TabButton active={activeTab === "chat"} onClick={() => setActiveTab("chat")} icon={<Bot size={18} />} label={t("sidebar.tabs.askAI")} />
                <TabButton active={activeTab === "mindmap"} onClick={() => setActiveTab("mindmap")} icon={<Network size={18} />} label={t("sidebar.tabs.mindmap")} />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto relative bg-white dark:bg-gray-900">
                <div className={activeTab === "summary" ? "block h-full" : "hidden"}>
                    <SummaryPanel key={`summary-${videoInfo?.id}`} />
                </div>
                <div className={activeTab === "comments" ? "block h-full" : "hidden"}>
                    <CommentsPanel key={`comments-${videoInfo?.id}`} />
                </div>
                <div className={activeTab === "chat" ? "block h-full" : "hidden"}>
                    <AskAIPanel key={`chat-${videoInfo?.id}`} />
                </div>
                <div className={activeTab === "mindmap" ? "absolute inset-0" : "hidden"}>
                    <MindMapPanel key={`mindmap-${videoInfo?.id}`} isActive={activeTab === "mindmap"} />
                </div>
            </div>
        </>
    )
}

export function Sidebar({ service, isOpen, onClose }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>("summary")

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="fixed right-0 top-0 h-full w-[400px] bg-white dark:bg-gray-900 shadow-2xl z-40 flex flex-col border-l dark:border-gray-800"
                >
                    <VideoProvider service={service} isOpen={isOpen}>
                        <SidebarContent activeTab={activeTab} setActiveTab={setActiveTab} onClose={onClose} />
                    </VideoProvider>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

function TabButton({ active, onClick, icon, label }: {
    active: boolean
    onClick: () => void
    icon: React.ReactNode
    label: string
}) {
    return (
        <button
            onClick={onClick}
            className={`flex-1 flex flex-col items-center justify-center py-3 text-[10px] gap-1 transition-all duration-200
        ${active
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/10 font-bold"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
        >
            {icon}
            <span className="uppercase tracking-wider">{label}</span>
        </button>
    )
}
