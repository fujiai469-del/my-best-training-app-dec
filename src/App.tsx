import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar as CalendarIcon, TrendingUp, Plus, Trash2, Dumbbell, 
  ChevronLeft, ChevronRight, Timer, X, Edit3, FileText, CheckCircle2, 
  Activity, Scale, Calculator, Bike, Play, Pause, Cloud, Loader2,
  User as UserIcon, Trophy, Globe, MapPin, CheckCircle, Mail, Lock,
  Share2, Download, Sparkles, Brain, Zap, Target, Flame, Copy
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar
} from 'recharts';
import { toPng } from 'html-to-image'; // ★ NEW: 画像生成ライブラリ
import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';
import { startOfYear, endOfYear } from 'date-fns';

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, 
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query
} from 'firebase/firestore';

// --- Firebase設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyCkPihsG0jqavKpy3e3j0CYlDQIEqjyyTQ",
  authDomain: "traininglogapp-f49d5.firebaseapp.com",
  projectId: "traininglogapp-f49d5",
  storageBucket: "traininglogapp-f49d5.firebasestorage.app",
  messagingSenderId: "363045442278",
  appId: "1:363045442278:web:d0033ea447b38b1b20a127",
  measurementId: "G-VMPL3VPKZF"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// --- 型定義 ---
type SetData = {
  id: string;
  weight: number; 
  reps: number;   
  distanceKm?: number; 
};

type Exercise = {
  id: string;
  name: string;
  sets: SetData[];
};

type WorkoutSession = {
  id: string;
  date: string; 
  exercises: Exercise[];
  bodyWeight?: number | null;
  memo?: string;
  updatedAt?: number;
};

type WorkoutTemplate = {
  id: string;
  name: string;
  exerciseNames: string[];
  createdAt: number;
};

// --- 定数 ---
const CARDIO_EXERCISES = ["エアロバイク", "自転車", "スピンバイク", "ランニングマシン", "ランニング", "ウォーキング"];

const SUGGESTED_EXERCISES = [
  "ランニング", "ウォーキング", "エアロバイク", "自転車", "スピンバイク", "ランニングマシン",
  "バーベルベンチプレス", "ダンベルベンチプレス", "インクライン・バーベルベンチ", "ダンベルフライ",
  "デッドリフト", "懸垂 (チンニング)", "ラットプルダウン", "ベントオーバーロウ",
  "スクワット", "レッグプレス", "レッグエクステンション",
  "ミリタリープレス", "サイドレイズ",
  "バーベルカール", "ダンベルカール",
  "アブローラー"
];

// 地球儀トラベルの目的地リスト
const TRAVEL_DESTINATIONS = [
  { name: "日本国内一周", distance: 3000, target: "札幌" }, 
  { name: "日本 → 韓国", distance: 400, target: "ソウル" }, 
  { name: "韓国 → 上海", distance: 1000, target: "上海" }, 
  { name: "上海 → バンコク", distance: 3000, target: "バンコク" },
  { name: "バンコク → ドバイ", distance: 5000, target: "ドバイ" }, 
  { name: "ドバイ → ロンドン", distance: 5500, target: "ロンドン" },
];

// --- Utility ---
const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatDate = (date: Date) => date.toISOString().split('T')[0];

const calculate1RM = (weight: number, reps: number) => {
  if (weight === 0 || reps === 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
};

// --- Rank System Logic ---
const RANKS = [
  { name: 'ROOKIE', threshold: 0, color: 'text-[#555]', bg: 'bg-[#555]' },
  { name: 'BRONZE LIFTER', threshold: 5000, color: 'text-[#ff9900]', bg: 'bg-[#ff9900]' }, 
  { name: 'SILVER LIFTER', threshold: 50000, color: 'text-[#c0c0c0]', bg: 'bg-[#c0c0c0]' }, 
  { name: 'GOLD MASTER', threshold: 150000, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]' }, 
  { name: 'PLATINUM ELITE', threshold: 500000, color: 'text-[#00ffff]', bg: 'bg-[#00ffff]' }, 
  { name: 'LEGEND', threshold: 1000000, color: 'text-[#9400d3]', bg: 'bg-[#9400d3]' } 
];

const calculateSessionVolume = (session: WorkoutSession): number => {
    return session.exercises.reduce((sessionSum, exercise) => {
        return sessionSum + exercise.sets.reduce((setSum, set) => {
            if (CARDIO_EXERCISES.includes(exercise.name)) return setSum;

            return setSum + (set.weight * set.reps);
        }, 0);
    }, 0);
};

const calculateTotalDistance = (workouts: WorkoutSession[]): number => {
  return workouts.reduce((total, session) => {
    return total + session.exercises.reduce((sessionSum, exercise) => {
      if (!CARDIO_EXERCISES.includes(exercise.name)) return sessionSum;
      return sessionSum + exercise.sets.reduce((setSum, set) => {
        return setSum + (set.distanceKm || 0);
      }, 0);
    }, 0);
  }, 0);
};

const calculateTotalVolume = (workouts: WorkoutSession[]): number => {
    return workouts.reduce((total, w) => total + calculateSessionVolume(w), 0);
};

const getRankInfo = (totalVolume: number) => {
  const currentRankIndex = RANKS.slice().reverse().findIndex(r => totalVolume >= r.threshold);
  const index = currentRankIndex === -1 ? 0 : RANKS.length - 1 - currentRankIndex;
  
  const currentRank = RANKS[index];
  const nextRank = RANKS[index + 1];
  
  return {
    current: currentRank,
    next: nextRank,
    progress: nextRank 
      ? Math.min(100, ((totalVolume - currentRank.threshold) / (nextRank.threshold - currentRank.threshold)) * 100)
      : 100,
    remaining: nextRank ? nextRank.threshold - totalVolume : 0
  };
};

const getTravelProgress = (totalDistance: number) => {
    let accumulatedDistance = 0;
    let currentDestinationIndex = 0;
    for (let i = 0; i < TRAVEL_DESTINATIONS.length; i++) {
        const target = TRAVEL_DESTINATIONS[i];
        const segmentEnd = accumulatedDistance + target.distance;
        
        if (totalDistance < segmentEnd) {
            currentDestinationIndex = i;
            break;
        }
        accumulatedDistance = segmentEnd;
        
        if (i === TRAVEL_DESTINATIONS.length - 1) {
            currentDestinationIndex = i; // 最後の目標を達成
        }
    }

    const currentTarget = TRAVEL_DESTINATIONS[currentDestinationIndex];
    const completedDistance = TRAVEL_DESTINATIONS.slice(0, currentDestinationIndex).reduce((sum, d) => sum + d.distance, 0);
    const segmentTotal = currentTarget.distance;
    const distanceInSegment = totalDistance - completedDistance;
    
    return {
        currentDestinationIndex,
        isCompleted: currentDestinationIndex === TRAVEL_DESTINATIONS.length - 1 && totalDistance >= accumulatedDistance,
        currentCity: currentDestinationIndex > 0 ? TRAVEL_DESTINATIONS[currentDestinationIndex - 1].target : "東京 (自宅)",
        nextTarget: currentTarget,
        progress: segmentTotal > 0 ? Math.min(100, (distanceInSegment / segmentTotal) * 100) : 100,
        remainingDistance: Math.max(0, segmentTotal - distanceInSegment)
    };
};

// --- Streak計算 ---
const calculateStreak = (workouts: WorkoutSession[]): { current: number; best: number } => {
  if (workouts.length === 0) return { current: 0, best: 0 };

  const uniqueDates = Array.from(new Set(
    workouts.map(w => w.date)
  )).sort();

  if (uniqueDates.length === 0) return { current: 0, best: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);

  // 現在のストリーク（今日 or 昨日から逆算）
  let currentStreak = 0;
  const latestDate = uniqueDates[uniqueDates.length - 1];
  if (latestDate === todayStr || latestDate === yesterdayStr) {
    currentStreak = 1;
    for (let i = uniqueDates.length - 2; i >= 0; i--) {
      const curr = new Date(uniqueDates[i + 1]);
      const prev = new Date(uniqueDates[i]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // 最高ストリーク
  let bestStreak = 1;
  let tempStreak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const curr = new Date(uniqueDates[i]);
    const prev = new Date(uniqueDates[i - 1]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      tempStreak++;
      bestStreak = Math.max(bestStreak, tempStreak);
    } else {
      tempStreak = 1;
    }
  }
  bestStreak = Math.max(bestStreak, currentStreak);

  return { current: currentStreak, best: bestStreak };
};

// --- ISO週番号取得 ---
const getISOWeek = (date: Date): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
};

// --- UI Components ---

// ★ NEW: レシート画像生成モーダル ★
const ShareReceiptModal = ({ isOpen, onClose, session }: { isOpen: boolean, onClose: () => void, session: WorkoutSession | undefined }) => {
    const receiptRef = useRef<HTMLDivElement>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    if (!isOpen || !session) return null;

    const sessionVolume = calculateSessionVolume(session);
    const sessionDistance = session.exercises.reduce((acc, ex) => {
        if (CARDIO_EXERCISES.includes(ex.name)) {
            return acc + ex.sets.reduce((sAcc, set) => sAcc + (set.distanceKm || 0), 0);
        }
        return acc;
    }, 0);

    const handleDownload = async () => {
        if (receiptRef.current === null) return;
        setIsGenerating(true);
        try {
            const dataUrl = await toPng(receiptRef.current, { cacheBust: true, pixelRatio: 3 }); // 高画質化
            const link = document.createElement('a');
            link.download = `training-log-${session.date}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Oops, something went wrong!', err);
            alert('画像生成に失敗しました。');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
            <div className="flex flex-col items-center gap-6 w-full max-w-sm">
                
                {/* レシート本体 (HTML) */}
                <div ref={receiptRef} className="bg-[#050505] text-[#D4AF37] p-8 w-full shadow-2xl border-t-4 border-b-4 border-[#D4AF37] font-mono relative">
                    {/* 背景テクスチャ（スキャンライン） */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 pointer-events-none bg-[length:100%_2px,3px_100%]"></div>
                    
                    <div className="relative z-10">
                        <div className="text-center border-b-2 border-dashed border-[#D4AF37]/50 pb-6 mb-6">
                            <h1 className="text-2xl font-black tracking-[0.2em] mb-2">TRAINING LOG</h1>
                            <p className="text-[10px] uppercase tracking-widest text-[#888]">SESSION REPORT</p>
                            <div className="mt-4 flex justify-between text-xs text-[#888]">
                                <span>DATE: {session.date}</span>
                                <span>ID: {Math.floor(Math.random() * 10000).toString().padStart(4, '0')}</span>
                            </div>
                        </div>

                        <div className="space-y-6 mb-8">
                            {session.exercises.map((ex, i) => (
                                <div key={i}>
                                    <div className="flex justify-between items-baseline mb-1">
                                        <span className="font-bold text-sm uppercase truncate pr-4">{ex.name}</span>
                                        <span className="text-xs text-[#888] whitespace-nowrap">{ex.sets.length} SETS</span>
                                    </div>
                                    <div className="pl-4 border-l border-[#333] space-y-1">
                                        {ex.sets.map((set, j) => (
                                            <div key={j} className="flex justify-between text-xs text-[#ccc]">
                                                <span>SET {j + 1}</span>
                                                <span className="font-bold">
                                                    {CARDIO_EXERCISES.includes(ex.name) 
                                                        ? `${set.distanceKm ? set.distanceKm + 'km / ' : ''}${formatDuration(set.reps)}` 
                                                        : `${set.weight}kg x ${set.reps}`}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="border-t-2 border-dashed border-[#D4AF37]/50 pt-6 space-y-2">
                            {sessionVolume > 0 && (
                                <div className="flex justify-between items-end">
                                    <span className="text-xs text-[#888]">TOTAL VOLUME</span>
                                    <span className="text-xl font-bold">{sessionVolume.toLocaleString()} <span className="text-xs">KG</span></span>
                                </div>
                            )}
                            {sessionDistance > 0 && (
                                <div className="flex justify-between items-end">
                                    <span className="text-xs text-[#888]">TOTAL DISTANCE</span>
                                    <span className="text-xl font-bold">{sessionDistance.toFixed(1)} <span className="text-xs">KM</span></span>
                                </div>
                            )}
                        </div>

                        <div className="mt-10 text-center">
                            <div className="text-[10px] text-[#444] mb-2">********************************</div>
                            <p className="text-xs font-bold tracking-widest">KEEP GRINDING.</p>
                            <p className="text-[10px] text-[#666] mt-1">GENERATED BY TRAINING LOG</p>
                            <div className="text-[10px] text-[#444] mt-2">********************************</div>
                            
                            {/* バーコード風装飾 */}
                            <div className="h-8 w-2/3 mx-auto mt-4 flex items-end justify-center gap-0.5 opacity-70">
                                {[...Array(40)].map((_, i) => (
                                    <div key={i} className={`bg-[#D4AF37] w-0.5 ${Math.random() > 0.5 ? 'h-full' : 'h-1/2'}`}></div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* アクションボタン */}
                <div className="flex gap-4 w-full">
                    <button onClick={onClose} className="flex-1 py-3 rounded bg-[#222] text-[#888] font-bold text-sm hover:text-white transition-colors">
                        閉じる
                    </button>
                    <button onClick={handleDownload} disabled={isGenerating} className="flex-1 py-3 rounded bg-[#D4AF37] text-black font-bold text-sm shadow-[0_0_15px_rgba(212,175,55,0.4)] hover:bg-[#fff] transition-colors flex items-center justify-center gap-2">
                        {isGenerating ? <Loader2 size={16} className="animate-spin"/> : <><Download size={16}/> 画像を保存</>}
                    </button>
                </div>
                <p className="text-[10px] text-[#666]">※保存した画像をX(Twitter)等でシェアできます</p>
            </div>
        </div>
    );
};

const EmailAuthModal = ({ isOpen, onClose, onAuth }: any) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isRegisterMode, setIsRegisterMode] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (isRegisterMode) {
                await createUserWithEmailAndPassword(auth, email, password);
                alert("アカウントを作成しました！匿名データと連携されました。");
            } else {
                await signInWithEmailAndPassword(auth, email, password);
                alert("ログイン成功！データと連携されました。");
            }
            onAuth();
            onClose();
        } catch (err: any) {
            console.error("Auth Error:", err);
            if (err.code === 'auth/email-already-in-use') {
                setError('このメールアドレスは既に登録されています。ログインをお試しください。');
                setIsRegisterMode(false);
            } else if (err.code === 'auth/user-not-found') {
                setError('ユーザーが見つかりません。新規登録をお試しください。');
                setIsRegisterMode(true);
            } else if (err.code === 'auth/wrong-password') {
                 setError('パスワードが間違っています。');
            } else {
                setError(`認証エラー: ${err.message}`);
            }
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[#111] border border-[#333] w-full max-w-xs rounded-xl p-6 shadow-2xl relative space-y-4">
                <button onClick={onClose} className="absolute top-4 right-4 text-[#666] hover:text-white"><X size={20}/></button>
                <h3 className="text-[#D4AF37] font-bold text-lg mb-2 flex items-center gap-2">
                    <Mail size={18}/> {isRegisterMode ? "アカウント作成" : "ログイン / 連携"}
                </h3>
                
                {error && <p className="text-xs text-red-500 bg-red-900/20 p-2 rounded border border-red-900">{error}</p>}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative">
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            placeholder="メールアドレス"
                            className="w-full bg-[#050505] border border-[#222] text-white pl-10 p-3 rounded font-mono focus:border-[#D4AF37] outline-none transition-all text-sm"
                            required
                        />
                        <Mail size={14} className="absolute left-3 top-3.5 text-[#444]" />
                    </div>
                    <div className="relative">
                        <input 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            placeholder="パスワード"
                            className="w-full bg-[#050505] border border-[#222] text-white pl-10 p-3 rounded font-mono focus:border-[#D4AF37] outline-none transition-all text-sm"
                            required
                        />
                        <Lock size={14} className="absolute left-3 top-3.5 text-[#444]" />
                    </div>

                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full bg-[#D4AF37] text-black py-3 rounded font-bold text-sm shadow-[0_0_10px_rgba(212,175,55,0.2)] transition-all disabled:bg-[#222] disabled:text-[#666] flex items-center justify-center gap-2"
                    >
                        {isLoading ? <Loader2 size={16} className="animate-spin"/> : (isRegisterMode ? "登録して連携" : "ログイン")}
                    </button>
                </form>

                <button 
                    onClick={() => setIsRegisterMode(!isRegisterMode)}
                    className="w-full text-xs text-[#666] hover:text-[#D4AF37] pt-2 border-t border-[#1a1a1a]"
                >
                    {isRegisterMode ? ">> 既にアカウントをお持ちですか？" : ">> 新規アカウント作成はこちら"}
                </button>
            </div>
        </div>
    );
};

// ★ NEW: ワークアウトテンプレートモーダル ★
const TemplateModal = ({ isOpen, onClose, currentExercises, onLoadTemplate, userId }: {
  isOpen: boolean;
  onClose: () => void;
  currentExercises: Exercise[];
  onLoadTemplate: (exerciseNames: string[]) => void;
  userId: string | null;
}) => {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [activeView, setActiveView] = useState<'list' | 'create'>('list');

  useEffect(() => {
    if (!userId) return;
    const templatesRef = collection(db, 'users', userId, 'templates');
    const q = query(templatesRef);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded: WorkoutTemplate[] = [];
      snapshot.forEach((d) => { loaded.push(d.data() as WorkoutTemplate); });
      setTemplates(loaded.sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => unsubscribe();
  }, [userId]);

  const handleSaveTemplate = async () => {
    if (!userId || !newTemplateName.trim() || currentExercises.length === 0) return;
    const template: WorkoutTemplate = {
      id: Date.now().toString(),
      name: newTemplateName.trim(),
      exerciseNames: currentExercises.map(ex => ex.name),
      createdAt: Date.now()
    };
    await setDoc(doc(collection(db, 'users', userId, 'templates'), template.id), template);
    setNewTemplateName('');
    setActiveView('list');
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!userId || !window.confirm('このテンプレートを削除しますか？')) return;
    await deleteDoc(doc(collection(db, 'users', userId, 'templates'), templateId));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#111] border border-[#333] w-full max-w-md rounded-xl p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#666] hover:text-white"><X size={20}/></button>
        <h3 className="text-[#D4AF37] font-bold text-lg mb-4 flex items-center gap-2">
          <Copy size={18}/> テンプレート
        </h3>

        <div className="flex gap-2 mb-4 bg-[#0a0a0a] p-1 rounded border border-[#222]">
          <button onClick={() => setActiveView('list')} className={`flex-1 py-2 text-xs font-bold rounded transition-all ${activeView === 'list' ? 'bg-[#D4AF37] text-black' : 'text-[#666]'}`}>
            一覧
          </button>
          <button onClick={() => setActiveView('create')} className={`flex-1 py-2 text-xs font-bold rounded transition-all ${activeView === 'create' ? 'bg-[#D4AF37] text-black' : 'text-[#666]'}`}>
            新規保存
          </button>
        </div>

        {activeView === 'create' && (
          <div className="space-y-4 animate-in fade-in">
            {currentExercises.length === 0 ? (
              <p className="text-xs text-[#666] text-center py-8">種目を追加してからテンプレートを保存できます</p>
            ) : (
              <>
                <div>
                  <label className="text-[10px] text-[#555] mb-2 block">テンプレート名</label>
                  <input type="text" value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} placeholder="例: 胸の日、脚の日" className="w-full bg-[#050505] border border-[#222] text-white p-3 rounded focus:border-[#D4AF37] outline-none text-sm" />
                </div>
                <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded p-3">
                  <p className="text-[10px] text-[#555] mb-2">保存される種目:</p>
                  <div className="space-y-1">
                    {currentExercises.map((ex, i) => (
                      <div key={i} className="text-xs text-[#D4AF37] flex items-center gap-2"><CheckCircle2 size={12} /> {ex.name}</div>
                    ))}
                  </div>
                </div>
                <button onClick={handleSaveTemplate} disabled={!newTemplateName.trim()} className="w-full bg-[#D4AF37] text-black py-3 rounded font-bold text-sm disabled:bg-[#222] disabled:text-[#444] transition-all flex items-center justify-center gap-2">
                  <CheckCircle2 size={14} /> テンプレートを保存
                </button>
              </>
            )}
          </div>
        )}

        {activeView === 'list' && (
          <div className="space-y-2 max-h-96 overflow-y-auto animate-in fade-in">
            {templates.length === 0 ? (
              <p className="text-xs text-[#666] text-center py-8">保存されたテンプレートがありません</p>
            ) : (
              templates.map(template => (
                <div key={template.id} className="bg-[#0a0a0a] border border-[#222] rounded-lg p-3 hover:border-[#D4AF37]/40 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-[#D4AF37] text-sm">{template.name}</h4>
                    <button onClick={() => handleDeleteTemplate(template.id)} className="text-[#444] hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {template.exerciseNames.map((name, i) => (
                      <span key={i} className="text-[9px] bg-[#111] text-[#666] px-2 py-1 rounded border border-[#1a1a1a]">{name}</span>
                    ))}
                  </div>
                  <button onClick={() => { onLoadTemplate(template.exerciseNames); onClose(); }} className="w-full bg-[#1a1a1a] hover:bg-[#222] text-[#D4AF37] py-2 rounded text-xs font-bold transition-all flex items-center justify-center gap-2 border border-[#333]">
                    <Plus size={12} /> 読み込む
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const NavButton = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1.5 group transition-all duration-300 ${active ? '-translate-y-1' : ''}`}>
    <div className={`p-1 rounded-full transition-all duration-300 ${active ? 'text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.5)]' : 'text-[#555] group-hover:text-[#888]'}`}>
      {React.cloneElement(icon, { size: 22, strokeWidth: active ? 2.5 : 2 })}
    </div>
    <span className={`text-[10px] font-bold ${active ? 'text-[#D4AF37]' : 'text-[#444]'}`}>{label}</span>
  </button>
);

const PlateCalculatorModal = ({ isOpen, onClose, targetWeight }: any) => {
  if (isOpen === false) return null;
  const barWeight = 20;
  const weightWithoutBar = Math.max(0, targetWeight - barWeight);
  const oneSideWeight = weightWithoutBar / 2;
  const plates = [25, 20, 15, 10, 5, 2.5, 1.25];
  const result = [];
  let remaining = oneSideWeight;
  for (const p of plates) {
    const count = Math.floor(remaining / p);
    if (count > 0) {
      result.push({ weight: p, count });
      remaining -= count * p;
      remaining = Math.round(remaining * 100) / 100;
    }
  }
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#111] border border-[#333] w-full max-w-xs rounded-xl p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#666] hover:text-white"><X size={20}/></button>
        <h3 className="text-[#D4AF37] font-bold text-lg mb-2 flex items-center gap-2"><Calculator size={18}/> プレート計算</h3>
        <p className="text-[#888] text-xs mb-6">バーベル(20kg)込み: <span className="text-white font-bold">{targetWeight}kg</span></p>
        <div className="flex justify-center items-center gap-1 mb-8">
          <div className="h-4 w-full bg-[#333] rounded-l flex items-center justify-end pr-1 relative">
              <span className="absolute left-2 text-[9px] text-[#555]">BAR</span>
              {result.map((r, i) => (
                <div key={i} className="flex">
                  {Array.from({length: r.count}).map((_, j) => (
                    <div key={`${i}-${j}`} className={`h-12 border-r border-[#111] flex items-center justify-center text-[9px] font-bold text-black ${r.weight >= 20 ? 'w-4 bg-[#D4AF37] h-16' : r.weight >= 10 ? 'w-3 bg-[#D4AF37]/80 h-14' : 'w-2 bg-[#D4AF37]/60 h-10'}`}></div>
                  ))}
                </div>
              ))}
          </div>
          <div className="h-16 w-2 bg-[#555] rounded-sm"></div>
        </div>
        <div className="space-y-2">
          {result.length === 0 ? <div className="text-center text-[#555] py-4">プレートなし</div> : result.map((r, i) => (
            <div key={i} className="flex justify-between items-center"><span className="font-bold text-[#e5e5e5]">{r.weight}kg</span><span className="text-[#D4AF37] font-mono">x {r.count}枚</span></div>
          ))}
        </div>
      </div>
    </div>
  );
};

const CardioStopwatch = ({ onTimeUpdate }: { onTimeUpdate: (seconds: number) => void }) => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef<number>(0);

  useEffect(() => {
    const saved = localStorage.getItem('cardio_timer_state');
    if (saved) {
      const { startTime, accumulatedTime, isRunning: savedIsRunning } = JSON.parse(saved);
      if (savedIsRunning && startTime) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setTime(accumulatedTime + elapsed);
        startTimeRef.current = startTime;
        accumulatedTimeRef.current = accumulatedTime;
        setIsRunning(true);
      } else {
        setTime(accumulatedTime);
        accumulatedTimeRef.current = accumulatedTime;
      }
    }
  }, []);

  useEffect(() => {
    let interval: any;
    if (isRunning) {
      interval = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setTime(accumulatedTimeRef.current + elapsed);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    localStorage.setItem('cardio_timer_state', JSON.stringify({
      startTime: startTimeRef.current,
      accumulatedTime: accumulatedTimeRef.current,
      isRunning
    }));
    onTimeUpdate(time);
  }, [time, isRunning, onTimeUpdate]);

  const handleToggle = () => {
    if (isRunning) {
      accumulatedTimeRef.current += Math.floor((Date.now() - (startTimeRef.current || Date.now())) / 1000);
      startTimeRef.current = null;
      setIsRunning(false);
    } else {
      startTimeRef.current = Date.now();
      setIsRunning(true);
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    setTime(0);
    startTimeRef.current = null;
    accumulatedTimeRef.current = 0;
    localStorage.removeItem('cardio_timer_state');
  };

  return (
    <div className="bg-[#050505] border border-[#333] rounded p-4 mb-4 flex flex-col items-center">
      <div className="text-4xl font-mono font-bold text-[#D4AF37] mb-4 tracking-wider">{formatDuration(time)}</div>
      <div className="flex gap-4 w-full">
        <button onClick={handleToggle} className={`flex-1 py-3 rounded font-bold flex items-center justify-center gap-2 transition-all ${isRunning ? 'bg-[#222] text-[#888] border border-[#333]' : 'bg-[#D4AF37] text-black shadow-[0_0_10px_rgba(212,175,55,0.3)]'}`}>
          {isRunning ? <><Pause size={16}/> STOP</> : <><Play size={16}/> START</>}
        </button>
        <button onClick={handleReset} className="px-4 py-3 bg-[#111] text-[#666] rounded border border-[#222] hover:text-white">RESET</button>
      </div>
    </div>
  );
};

// ★ グローバルタイマー制御用のイベント
const timerEventTarget = new EventTarget();

// ★ プッシュ通知の許可をリクエストする関数
const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.log('このブラウザは通知をサポートしていません');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
};

// ★ プッシュ通知を送信する関数
const sendTimerNotification = () => {
  if (Notification.permission === 'granted') {
    const notification = new Notification('💪 REST OVER!', {
      body: '休憩時間が終了しました。次のセットを始めましょう！',
      icon: '/icon.png',
      badge: '/icon.png',
      tag: 'interval-timer',
      requireInteraction: true,
      silent: false
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    // 通知音を再生
    playNotificationSound();
  }
};

// ★ 通知音を再生する関数
const playNotificationSound = () => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.frequency.value = 880; // A5
  oscillator.type = 'sine';
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
  // 2回目の音
  setTimeout(() => {
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    osc2.frequency.value = 1046.5; // C6
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    osc2.start(audioContext.currentTime);
    osc2.stop(audioContext.currentTime + 0.5);
  }, 200);
};

const SmartIntervalTimer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [preset, setPreset] = useState<number>(60); // デフォルト60秒
  const [customPreset, setCustomPreset] = useState<number>(60);
  const [isFlashing, setIsFlashing] = useState(false);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const endTimeRef = useRef<number | null>(null);

  // ★ 通知許可状態をチェック
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationEnabled(Notification.permission === 'granted');
    }
  }, []);

  const handleEnableNotification = async () => {
    const granted = await requestNotificationPermission();
    setNotificationEnabled(granted);
    if (granted) {
      // テスト通知を送信
      new Notification('🔔 通知が有効になりました', {
        body: 'タイマー終了時に通知でお知らせします',
        icon: '/icon.png'
      });
    }
  };

  // 外部からタイマー開始を受け取るイベントリスナー
  useEffect(() => {
    const handleStartTimer = (e: Event) => {
      const customEvent = e as CustomEvent;
      const duration = customEvent.detail?.duration || customPreset;
      startTimer(duration);
    };
    timerEventTarget.addEventListener('startTimer', handleStartTimer);
    return () => timerEventTarget.removeEventListener('startTimer', handleStartTimer);
  }, [customPreset]);

  useEffect(() => {
    const saved = localStorage.getItem('smart_interval_timer_state');
    if (saved) {
      const { endTime, preset: savedPreset, customPreset: savedCustom, isActive: savedIsActive, isOpen: savedIsOpen } = JSON.parse(saved);
      setPreset(savedPreset || 60);
      setCustomPreset(savedCustom || 60);
      setIsOpen(savedIsOpen);
      if (savedIsActive && endTime) {
        const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        setSeconds(remaining);
        endTimeRef.current = endTime;
        setIsActive(remaining > 0);
      } else {
        setSeconds(0);
      }
    }
  }, []);

  useEffect(() => {
    let interval: any = null;
    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        if (endTimeRef.current) {
          const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
          setSeconds(remaining);
          if (remaining === 0) {
            setIsActive(false);
            // ★ タイマー終了時のフラッシュ通知
            triggerFlash();
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 200]);
            // ★ プッシュ通知を送信
            sendTimerNotification();
          }
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, seconds]);

  useEffect(() => {
    localStorage.setItem('smart_interval_timer_state', JSON.stringify({
      endTime: endTimeRef.current,
      preset,
      customPreset,
      isActive,
      isOpen
    }));
  }, [seconds, isActive, isOpen, preset, customPreset]);

  const triggerFlash = () => {
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 2000);
  };

  const startTimer = (sec: number) => {
    const endTime = Date.now() + sec * 1000;
    endTimeRef.current = endTime;
    setSeconds(sec);
    setPreset(sec);
    setIsActive(true);
    setIsOpen(true);
  };

  const toggleTimer = () => {
    if (isActive) {
      setIsActive(false);
      endTimeRef.current = null;
    } else if (seconds > 0) {
      const endTime = Date.now() + seconds * 1000;
      endTimeRef.current = endTime;
      setIsActive(true);
    }
  };

  const resetTimer = () => {
    setIsActive(false);
    setSeconds(preset || 60);
    endTimeRef.current = null;
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleCustomPresetChange = (value: number) => {
    const clampedValue = Math.max(10, Math.min(300, value));
    setCustomPreset(clampedValue);
  };

  // ★ ゴールドフラッシュオーバーレイ
  const FlashOverlay = () => (
    <div className={`fixed inset-0 z-50 pointer-events-none transition-opacity duration-300 ${isFlashing ? 'opacity-100' : 'opacity-0'}`}>
      <div className="absolute inset-0 bg-[#D4AF37] animate-pulse" style={{ animation: 'goldFlash 0.3s ease-in-out 6' }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-black text-4xl font-black tracking-widest animate-bounce">REST OVER!</div>
      </div>
      <style>{`
        @keyframes goldFlash {
          0%, 100% { opacity: 0; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );

  if (isOpen === false) {
    return (
      <>
        <FlashOverlay />
        <button onClick={() => setIsOpen(true)} className="fixed bottom-20 right-4 bg-[#1a1a1a] border border-[#D4AF37]/30 text-[#D4AF37] p-3 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.6)] z-30 hover:scale-105 active:scale-95 transition-all group">
          <Timer size={24} className="group-hover:rotate-12 transition-transform" />
        </button>
      </>
    );
  }

  return (
    <>
      <FlashOverlay />
      <div className="fixed bottom-20 right-4 bg-[#0f0f0f]/95 backdrop-blur-xl border border-[#333] p-5 rounded-xl shadow-2xl z-30 w-80 animate-in fade-in slide-in-from-bottom-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[#D4AF37] text-xs font-bold flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-[#D4AF37]'}`}></div>
            スマートインターバル
          </h3>
          <button onClick={() => setIsOpen(false)} className="text-[#555] hover:text-[#fff] transition-colors"><X size={16}/></button>
        </div>
        
        <div className="text-center">
          {/* タイマー表示 */}
          <div className={`text-5xl font-mono font-bold mb-4 tracking-tight transition-colors duration-300 ${
            seconds === 0 && !isActive ? 'text-[#D4AF37] animate-pulse' : 
            seconds <= 5 && isActive ? 'text-red-500' : 'text-[#e5e5e5]'
          }`}>
            {formatTime(seconds)}
          </div>
          
          {/* プログレスバー */}
          {isActive && preset > 0 && (
            <div className="h-1 w-full bg-[#222] rounded-full overflow-hidden mb-4">
              <div 
                className="h-full bg-gradient-to-r from-[#D4AF37] to-[#ffcc00] transition-all duration-1000"
                style={{ width: `${(seconds / preset) * 100}%` }}
              />
            </div>
          )}
          
          {/* コントロールボタン */}
          <div className="flex justify-center gap-2 mb-4">
            <button onClick={toggleTimer} className={`flex-1 py-3 rounded text-xs font-bold transition-all border ${
              isActive ? 'bg-transparent border-[#333] text-[#666]' : 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.3)]'
            }`}>
              {isActive ? '一時停止' : 'スタート'}
            </button>
            <button onClick={resetTimer} className="px-4 py-3 bg-[#222] border border-[#333] rounded text-xs text-[#888] hover:text-white transition-colors">リセット</button>
          </div>
          
          {/* プリセットボタン */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[30, 60, 90, 120].map(t => (
              <button 
                key={t} 
                onClick={() => startTimer(t)} 
                className={`text-[10px] font-bold py-2 rounded border transition-all ${
                  preset === t && isActive 
                    ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]' 
                    : 'bg-[#111] hover:bg-[#222] border-[#222] text-[#666] hover:text-[#D4AF37]'
                }`}
              >
                {t}秒
              </button>
            ))}
          </div>
          
          {/* カスタム秒数設定 */}
          <div className="bg-[#0a0a0a] border border-[#222] rounded-lg p-3">
            <label className="text-[9px] text-[#555] uppercase tracking-wider block mb-2">カスタム休憩時間</label>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => handleCustomPresetChange(customPreset - 10)} 
                className="w-10 h-10 bg-[#111] border border-[#333] rounded text-[#888] hover:text-white hover:border-[#D4AF37] transition-all text-lg font-bold"
              >-</button>
              <div className="flex-1 text-center">
                <span className="text-2xl font-mono font-bold text-[#D4AF37]">{customPreset}</span>
                <span className="text-xs text-[#555] ml-1">秒</span>
              </div>
              <button 
                onClick={() => handleCustomPresetChange(customPreset + 10)} 
                className="w-10 h-10 bg-[#111] border border-[#333] rounded text-[#888] hover:text-white hover:border-[#D4AF37] transition-all text-lg font-bold"
              >+</button>
            </div>
            <button 
              onClick={() => startTimer(customPreset)} 
              className="w-full mt-3 py-2 bg-[#1a1a1a] border border-[#333] rounded text-xs text-[#888] hover:text-[#D4AF37] hover:border-[#D4AF37] transition-all"
            >
              カスタム時間で開始
            </button>
          </div>
          
          {/* ★ 通知設定 */}
          <div className="mt-4 pt-3 border-t border-[#1a1a1a]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-[#555] uppercase tracking-wider">プッシュ通知</span>
                {notificationEnabled ? (
                  <span className="text-[9px] text-green-500 flex items-center gap-1">
                    <CheckCircle size={10} /> 有効
                  </span>
                ) : (
                  <span className="text-[9px] text-[#666]">無効</span>
                )}
              </div>
              {!notificationEnabled && (
                <button
                  onClick={handleEnableNotification}
                  className="text-[9px] bg-[#D4AF37]/20 text-[#D4AF37] px-2 py-1 rounded border border-[#D4AF37]/30 hover:bg-[#D4AF37]/30 transition-colors"
                >
                  通知を有効にする
                </button>
              )}
            </div>
            <p className="text-[8px] text-[#333] mt-2 leading-relaxed">
              他のアプリ使用中やスリープ時も通知でお知らせ
            </p>
          </div>
          
          {/* 自動開始の説明 */}
          <p className="text-[9px] text-[#444] mt-3 leading-relaxed">
            セット記録後、自動でタイマーが開始されます
          </p>
        </div>
      </div>
    </>
  );
};

// 後方互換性のためのエイリアス
const TimerOverlay = SmartIntervalTimer;

const TrainingHeatmap = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const today = new Date();
  const startDate = startOfYear(today);
  const endDate = endOfYear(today);

  const heatmapData = useMemo(() => {
    const counts: { [key: string]: number } = {};
    workouts.forEach(w => {
      counts[w.date] = (counts[w.date] || 0) + 1;
    });
    return Object.keys(counts).map(date => ({
      date,
      count: counts[date]
    }));
  }, [workouts]);

  return (
    <div className="mb-6 bg-[#0f0f0f] border border-[#222] rounded-xl p-4 shadow-xl">
      <h3 className="text-[10px] text-[#555] uppercase tracking-widest mb-4 flex items-center gap-2">
        <CalendarIcon size={12} className='text-[#D4AF37]'/> TRAINING ACTIVITY
      </h3>
      <div className="heatmap-container">
        <CalendarHeatmap
          startDate={startDate}
          endDate={endDate}
          values={heatmapData}
          classForValue={(value) => {
            if (!value) return 'color-empty';
            return `color-gold-${Math.min(value.count, 4)}`;
          }}
          titleForValue={(value: any) => {
            return value?.date ? `${value.date}: ${value.count} sessions` : 'No sessions';
          }}
        />
      </div>
      <style>{`
        .react-calendar-heatmap .color-empty { fill: #111; }
        .react-calendar-heatmap .color-gold-1 { fill: #4a3b00; }
        .react-calendar-heatmap .color-gold-2 { fill: #8a6d00; }
        .react-calendar-heatmap .color-gold-3 { fill: #c49b00; }
        .react-calendar-heatmap .color-gold-4 { fill: #D4AF37; }
        .react-calendar-heatmap rect { rx: 2; ry: 2; }
      `}</style>
    </div>
  );
};

const TrainingRadarChart = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const radarData = useMemo(() => {
    const categories = [
      { name: '胸', keywords: ['ベンチ', 'チェスト', 'フライ', '胸'] },
      { name: '背中', keywords: ['デッドリフト', '懸垂', 'ラットプル', 'ロウ', '背中'] },
      { name: '脚', keywords: ['スクワット', 'レッグ', '脚'] },
      { name: '肩', keywords: ['プレス', 'レイズ', '肩'] },
      { name: '腕', keywords: ['カール', 'エクステンション', '腕'] }
    ];

    const stats = categories.map(cat => {
      let volume = 0;
      workouts.forEach(session => {
        session.exercises.forEach(ex => {
          if (cat.keywords.some(k => ex.name.includes(k))) {
            ex.sets.forEach(set => {
              volume += (set.weight || 0) * (set.reps || 0);
            });
          }
        });
      });
      return { subject: cat.name, A: volume, fullMark: 100 };
    });

    const maxVolume = Math.max(...stats.map(s => s.A), 1);
    return stats.map(s => ({ ...s, A: (s.A / maxVolume) * 100 }));
  }, [workouts]);

  return (
    <div className="mb-6 bg-[#0f0f0f] border border-[#222] rounded-xl p-4 shadow-xl">
      <h3 className="text-[10px] text-[#555] uppercase tracking-widest mb-4 flex items-center gap-2">
        <Activity size={12} className='text-[#D4AF37]'/> BODY BALANCE
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
            <PolarGrid stroke="#333" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: '#888', fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              name="Volume"
              dataKey="A"
              stroke="#D4AF37"
              fill="#D4AF37"
              fillOpacity={0.6}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const BodyWeightTrendCard = ({ workouts }: { workouts: WorkoutSession[] }) => {
    const chartData = useMemo(() => {
        const now = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(now.getFullYear() - 1);

        const uniqueWeights = workouts
            .filter(w => {
                if (w.bodyWeight === undefined || w.bodyWeight === null || w.bodyWeight <= 0) return false;
                const wDate = new Date(w.date);
                return wDate >= oneYearAgo;
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map(w => ({
                date: w.date.substring(5).replace('-', '/'),
                weight: w.bodyWeight,
            }));
        
        return uniqueWeights;
    }, [workouts]);
    
    if (chartData.length < 2) return null;

    return (
        <div className="mb-6 bg-[#0f0f0f] border border-[#222] rounded-xl p-4 relative overflow-hidden shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
            <h3 className="text-[10px] text-[#555] uppercase tracking-widest mb-4 flex items-center gap-2">
                <Scale size={12} className='text-[#c0c0c0]'/> BODY WEIGHT TREND (1 YEAR)
            </h3>
            <div className='h-32'>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="weightColor" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#c0c0c0" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#c0c0c0" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                        <XAxis 
                            dataKey="date" 
                            stroke="#444" 
                            fontSize={9} 
                            tick={{fill: '#666'}} 
                            tickMargin={5} 
                            axisLine={false} 
                            tickLine={false} 
                            interval="preserveStartEnd"
                        />
                        <YAxis 
                            dataKey="weight" 
                            stroke="#444" 
                            fontSize={9} 
                            tick={{fill: '#666'}} 
                            domain={['dataMin - 2', 'dataMax + 2']}
                            axisLine={false} 
                            tickLine={false} 
                            tickFormatter={(v) => `${v}`}
                            width={30}
                        />
                         <RechartsTooltip 
                            contentStyle={{ backgroundColor: '#000', border: '1px solid #333', color: '#fff' }}
                            itemStyle={{ color: '#c0c0c0' }}
                            formatter={(value: any) => [`${value} kg`, 'Weight']}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="weight" 
                            stroke="#c0c0c0" 
                            strokeWidth={2} 
                            fillOpacity={1} 
                            fill="url(#weightColor)" 
                            activeDot={{ r: 4, fill: '#fff' }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

// ★ NEW: トレーニングストリークカード ★
const StreakCard = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const streak = useMemo(() => calculateStreak(workouts), [workouts]);

  if (streak.best === 0 && streak.current === 0) return null;

  return (
    <div className="mb-6 bg-[#0f0f0f] border border-[#222] rounded-xl p-4 relative overflow-hidden shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#ff6b35] to-transparent opacity-70"></div>
      <h3 className="text-[10px] text-[#555] uppercase tracking-widest mb-4 flex items-center gap-2">
        <Flame size={12} className="text-[#ff6b35]" /> TRAINING STREAK
      </h3>
      <div className="grid grid-cols-2 gap-4">
        {/* 現在のストリーク */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-3 relative overflow-hidden">
          <div className={`absolute -right-4 -bottom-4 w-16 h-16 blur-[40px] opacity-20 ${streak.current >= 7 ? 'bg-[#ff6b35]' : 'bg-[#444]'}`} />
          <p className="text-[9px] text-[#555] uppercase tracking-wider mb-2">現在の連続記録</p>
          <div className="flex items-baseline gap-1 relative z-10">
            <span className={`text-3xl font-black font-mono ${streak.current >= 7 ? 'text-[#ff6b35]' : streak.current >= 3 ? 'text-yellow-500' : 'text-[#666]'}`}>
              {streak.current}
            </span>
            <span className="text-xs text-[#555]">日</span>
          </div>
          {streak.current >= 7 && (
            <div className="mt-2 flex items-center gap-1">
              <Flame size={10} className="text-[#ff6b35] animate-pulse" />
              <span className="text-[8px] text-[#ff6b35] font-bold">ON FIRE!</span>
            </div>
          )}
        </div>
        {/* 最高記録 */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-3 relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-[#D4AF37] blur-[40px] opacity-10" />
          <p className="text-[9px] text-[#555] uppercase tracking-wider mb-2">最高記録</p>
          <div className="flex items-baseline gap-1 relative z-10">
            <span className="text-3xl font-black font-mono text-[#D4AF37]">{streak.best}</span>
            <span className="text-xs text-[#555]">日</span>
          </div>
          {streak.current === streak.best && streak.best > 1 && (
            <div className="mt-2 flex items-center gap-1">
              <Trophy size={10} className="text-[#D4AF37]" />
              <span className="text-[8px] text-[#D4AF37] font-bold">BEST!</span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-[#1a1a1a]">
        <p className="text-[9px] text-[#444] text-center">
          {streak.current === 0 ? '今日から新しいストリークを始めよう！' :
           streak.current === 1 ? '良いスタート！明日も続けよう。' :
           streak.current < 7 ? `あと${7 - streak.current}日で1週間達成！` :
           streak.current < 30 ? '素晴らしい継続力！🔥' :
           'レジェンド級の継続！'}
        </p>
      </div>
    </div>
  );
};

// ★ NEW: 週間ボリューム推移チャート ★
const WeeklyVolumeChart = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const weeklyData = useMemo(() => {
    const weekMap: { [key: string]: number } = {};
    workouts.forEach(session => {
      const date = new Date(session.date);
      const week = getISOWeek(date);
      const volume = calculateSessionVolume(session);
      weekMap[week] = (weekMap[week] || 0) + volume;
    });
    const weeks = Object.keys(weekMap).sort().slice(-12);
    return weeks.map(week => ({
      week: week.substring(5),
      volume: weekMap[week]
    }));
  }, [workouts]);

  if (weeklyData.length < 2) return null;

  return (
    <div className="mb-6 bg-[#0f0f0f] border border-[#222] rounded-xl p-4 shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
      <h3 className="text-[10px] text-[#555] uppercase tracking-widest mb-4 flex items-center gap-2">
        <TrendingUp size={12} className="text-[#D4AF37]" /> WEEKLY VOLUME (12 WEEKS)
      </h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeklyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
            <XAxis dataKey="week" stroke="#444" fontSize={9} tick={{ fill: '#666' }} tickMargin={5} axisLine={false} tickLine={false} />
            <YAxis stroke="#444" fontSize={9} tick={{ fill: '#666' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <RechartsTooltip
              contentStyle={{ backgroundColor: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px' }}
              itemStyle={{ color: '#D4AF37' }}
              formatter={(value: number) => [`${value.toLocaleString()} kg`, 'Volume']}
            />
            <Bar dataKey="volume" fill="#D4AF37" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const MetricCard = ({ initialWeight, initialMemo, onSave }: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [weight, setWeight] = useState(initialWeight);
  const [memo, setMemo] = useState(initialMemo);
  useEffect(() => { if (initialWeight === '' && initialMemo === '') setIsEditing(true); else setIsEditing(false); }, [initialWeight, initialMemo]);
  const handleSave = () => { onSave(weight, memo); setIsEditing(false); };
  if (isEditing) {
    return (<div className="bg-[#0f0f0f] p-5 rounded border-t border-[#D4AF37]/20 relative mt-6"><h3 className="text-xs font-bold text-[#888] mb-4 flex items-center gap-2"><FileText size={14} /> 今日のメモ & 体重</h3><div className="space-y-4"><div><label className="text-[10px] text-[#555] mb-1 block">体重 (kg)</label><div className="relative"><Scale size={14} className="absolute left-3 top-3.5 text-[#444]" /><input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-full bg-[#050505] border border-[#222] text-white pl-9 p-3 rounded font-mono focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all" placeholder="0.0"/></div></div><div><label className="text-[10px] text-[#555] mb-1 block">メモ</label><textarea value={memo} onChange={(e) => setMemo(e.target.value)} className="w-full bg-[#050505] border border-[#222] text-[#ccc] p-3 rounded h-20 resize-none focus:border-[#D4AF37] outline-none transition-all text-sm leading-relaxed" placeholder="今日のコンディションや気づき"/></div><button onClick={handleSave} className="w-full bg-[#111] hover:bg-[#1a1a1a] text-[#888] hover:text-[#D4AF37] border border-[#333] py-3 rounded font-bold text-xs transition-all flex items-center justify-center gap-2"><CheckCircle2 size={14} /> 保存して完了</button></div></div>);
  }
  return (<div className="bg-[#0f0f0f] p-5 rounded border border-[#222] mt-6 relative"><div className="flex justify-between items-start mb-3"><h3 className="text-xs font-bold text-[#555] flex items-center gap-2">今日の記録</h3><button onClick={() => setIsEditing(true)} className="text-[#444] hover:text-[#D4AF37] transition-colors"><Edit3 size={14} /></button></div><div className="space-y-3"><div className="flex items-baseline gap-2"><span className="text-[10px] text-[#666]">体重:</span><span className="text-lg font-mono font-bold text-[#D4AF37]">{initialWeight || '--'} <span className="text-xs text-[#666]">kg</span></span></div><div className="pt-3 border-t border-[#1a1a1a]"><p className="text-sm text-[#aaa] whitespace-pre-wrap leading-6 font-light">{initialMemo || <span className="text-[#444] italic text-xs">メモなし</span>}</p></div></div></div>);
};

// --- Screens ---

const RecordScreen = ({ targetDate, setTargetDate, workouts, onSave, maxVolumeMap, userId }: any) => {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [bodyWeight, setBodyWeight] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [showPRModal, setShowPRModal] = useState(false);
  const [prValue, setPrValue] = useState(0);
  const [prUnit, setPrUnit] = useState<'kg' | 'km'>('kg');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false); // ★ テンプレート
  const [editingSet, setEditingSet] = useState<{ exIndex: number; setIndex: number } | null>(null); // ★ セット編集
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');
  const [editDistance, setEditDistance] = useState('');

  useEffect(() => {
    const session = workouts.find((w: WorkoutSession) => w.date === targetDate);
    if (session) {
      setExercises(session.exercises || []);
      setBodyWeight(session.bodyWeight ? session.bodyWeight.toString() : '');
      setMemo(session.memo || '');
    } else {
      setExercises([]);
      setBodyWeight('');
      setMemo('');
    }
  }, [targetDate, workouts]);
  const [currentExerciseName, setCurrentExerciseName] = useState('');

  // 種目が変わったらAIパネルを閉じる
  useEffect(() => {
    setShowAiPanel(false);
    setAiPrediction(null);
    setAiError(null);
  }, [currentExerciseName]);
  const [weightInput, setWeightInput] = useState('');
  const [repsInput, setRepsInput] = useState('');
  const [cardioSeconds, setCardioSeconds] = useState(0);
  const [distanceInput, setDistanceInput] = useState('');

  // ★ NEW: 前回の記録を取得する関数
  const getLastRecord = useMemo(() => {
    if (!currentExerciseName) return null;
    
    // 全ワークアウトを日付降順でソート
    const sortedWorkouts = [...workouts]
      .filter((w: WorkoutSession) => w.date !== targetDate) // 今日の記録は除外
      .sort((a: WorkoutSession, b: WorkoutSession) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // 指定された種目の最新の記録を検索
    for (const workout of sortedWorkouts) {
      const exercise = workout.exercises?.find((e: Exercise) => e.name === currentExerciseName);
      if (exercise && exercise.sets.length > 0) {
        return {
          date: workout.date,
          sets: exercise.sets
        };
      }
    }
    return null;
  }, [currentExerciseName, workouts, targetDate]); 
  
  const isCardio = useMemo(() => CARDIO_EXERCISES.includes(currentExerciseName), [currentExerciseName]);
  
  const estimated1RM = useMemo(() => {
    return calculate1RM(parseFloat(weightInput), parseInt(repsInput));
  }, [weightInput, repsInput]);

  // ★ NEW: AI予測機能の状態
  const [aiPrediction, setAiPrediction] = useState<{
    recommendedWeight: number;
    recommendedRepsMin: number;
    recommendedRepsMax: number;
    confidence: number;
    reasoning: string;
    advice: string;
  } | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // ★ 種目の全履歴を取得
  const getExerciseHistory = useMemo(() => {
    if (!currentExerciseName || isCardio) return [];
    
    const history: { weight: number; reps: number; date: string }[] = [];
    const sortedWorkouts = [...workouts]
      .sort((a: WorkoutSession, b: WorkoutSession) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    for (const workout of sortedWorkouts) {
      const exercise = workout.exercises?.find((e: Exercise) => e.name === currentExerciseName);
      if (exercise) {
        for (const set of exercise.sets) {
          history.push({
            weight: set.weight,
            reps: set.reps,
            date: workout.date
          });
        }
      }
    }
    return history;
  }, [currentExerciseName, workouts, isCardio]);

  // ★ AI予測を取得
  const fetchAiPrediction = async () => {
    if (!currentExerciseName || isCardio || getExerciseHistory.length < 3) {
      setAiError('予測には3件以上の記録が必要です');
      return;
    }

    setIsAiLoading(true);
    setAiError(null);
    setAiPrediction(null);
    setShowAiPanel(true);

    try {
      const response = await fetch('/api/ai-predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseName: currentExerciseName,
          history: getExerciseHistory
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'AI予測の取得に失敗しました');
      }

      const data = await response.json();
      const prediction = data.prediction;
      
      // フィールドがundefinedにならないようにデフォルト値を設定
      const safePrediction = {
        recommendedWeight: prediction.recommendedWeight ?? 0,
        recommendedRepsMin: prediction.recommendedRepsMin ?? 0,
        recommendedRepsMax: prediction.recommendedRepsMax ?? 0,
        confidence: prediction.confidence ?? 0,
        reasoning: prediction.reasoning || '過去の成長に基づく適切な増加。',
        advice: prediction.advice || 'フォームを重視して取り組んでください。'
      };
      
      setAiPrediction(safePrediction);
    } catch (error: any) {
      setAiError(error.message || 'AI予測の取得に失敗しました');
    } finally {
      setIsAiLoading(false);
    }
  };

  // ★ AI予測の値を入力欄に適用
  const applyAiPrediction = () => {
    if (aiPrediction) {
      setWeightInput(aiPrediction.recommendedWeight.toString());
      setRepsInput(aiPrediction.recommendedRepsMax.toString());
    }
  };

  const persistSession = (newEx: Exercise[], newWeight: string, newMemo: string) => {
    const wVal = newWeight ? parseFloat(newWeight) : null;
    const session: WorkoutSession = { id: targetDate, date: targetDate, exercises: newEx, bodyWeight: wVal, memo: newMemo };
    onSave(session);
  };

  // ★ テンプレート読み込み
  const handleLoadTemplate = (exerciseNames: string[]) => {
    const newExercises: Exercise[] = exerciseNames.map(name => ({
      id: Date.now().toString() + Math.random().toString(36).substring(2),
      name,
      sets: []
    }));
    setExercises(newExercises);
    persistSession(newExercises, bodyWeight, memo);
  };

  // ★ セット編集
  const startEditSet = (exIndex: number, setIndex: number, set: SetData) => {
    setEditingSet({ exIndex, setIndex });
    setEditWeight(set.weight.toString());
    setEditReps(set.reps.toString());
    setEditDistance(set.distanceKm?.toString() || '');
  };

  const saveEditSet = (exIndex: number, setIndex: number) => {
    const updated = [...exercises];
    const w = parseFloat(editWeight) || 0;
    const r = parseInt(editReps) || 0;
    const d = editDistance ? parseFloat(editDistance) : undefined;
    updated[exIndex].sets[setIndex] = {
      ...updated[exIndex].sets[setIndex],
      weight: w,
      reps: r,
      ...(d !== undefined && !isNaN(d) && d > 0 ? { distanceKm: d } : {})
    };
    setExercises(updated);
    persistSession(updated, bodyWeight, memo);
    setEditingSet(null);
  };

  const cancelEditSet = () => {
    setEditingSet(null);
  };

  // ★ NEW: PR演出を表示する関数
  const showPRCelebration = (value: number, unit: 'kg' | 'km') => {
    setPrValue(value);
    setPrUnit(unit);
    setShowPRModal(true);
    // 3秒後に自動で閉じる
    setTimeout(() => {
      setShowPRModal(false);
    }, 3000);
  };
  
  const addSet = () => {
    let w = parseFloat(weightInput);
    let r = isCardio ? cardioSeconds : parseInt(repsInput);
    let d = isCardio ? parseFloat(distanceInput) : undefined; 
    
    if (isCardio && (r === 0 || !d || d <= 0)) return; 
    if (isCardio === false && (!w || !r)) return; 
    
    const newSet: SetData = { 
      id: Date.now().toString(), 
      weight: w || 0, 
      reps: r,
    };
    
    if (d !== undefined && !isNaN(d) && d > 0) {
        newSet.distanceKm = d;
    }
    
    // ★ PR判定: 有酸素は距離、筋トレはボリュームで判定
    let isNewPR = false;
    let prDisplayValue = 0;
    let prDisplayUnit: 'kg' | 'km' = 'kg';

    if (isCardio) {
      // 有酸素: 1回の距離が過去最長ならPR
      const currentDistance = d || 0;
      isNewPR = currentDistance > (maxVolumeMap[currentExerciseName] || 0);
      prDisplayValue = currentDistance;
      prDisplayUnit = 'km';
    } else {
      const currentSetVolume = w * r;
      isNewPR = currentSetVolume > (maxVolumeMap[currentExerciseName] || 0);
      prDisplayValue = w;
      prDisplayUnit = 'kg';
    }

    let updatedExercises = [...exercises];
    const existingIdx = updatedExercises.findIndex(e => e.name === currentExerciseName);

    const setWithPR = isNewPR ? { ...newSet, isPR: true } : newSet;

    if (existingIdx >= 0) { updatedExercises[existingIdx] = { ...updatedExercises[existingIdx], sets: [...updatedExercises[existingIdx].sets, setWithPR] }; }
    else { updatedExercises.push({ id: Date.now().toString(), name: currentExerciseName, sets: [setWithPR] }); }
    setExercises(updatedExercises);
    persistSession(updatedExercises, bodyWeight, memo);

    setRepsInput('');
    setDistanceInput('');

    // ★ セット記録後に自動でインターバルタイマーを開始（有酸素運動以外）
    if (!isCardio) {
      timerEventTarget.dispatchEvent(new CustomEvent('startTimer'));
    }

    if(isNewPR) {
      // カスタムPR演出を表示
      showPRCelebration(prDisplayValue, prDisplayUnit);
    }
  };
  const removeSet = (exIndex: number, setIndex: number) => {
    let updated = [...exercises];
    updated[exIndex].sets.splice(setIndex, 1);
    if (updated[exIndex].sets.length === 0) updated.splice(exIndex, 1);
    setExercises(updated);
    persistSession(updated, bodyWeight, memo);
  };
  const handleMetricsSave = (w: string, m: string) => { setBodyWeight(w); setMemo(m); persistSession(exercises, w, m); };
  const changeDate = (offset: number) => { const d = new Date(targetDate); d.setDate(d.getDate() + offset); setTargetDate(formatDate(d)); };

  // 現在表示中のセッションデータを作成 (レシート用)
  const currentSession = { id: targetDate, date: targetDate, exercises, bodyWeight: bodyWeight ? parseFloat(bodyWeight) : null, memo };

  return (
    <div className="space-y-6 pb-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between px-2">
        <button onClick={() => changeDate(-1)} className="p-2 hover:bg-[#111] rounded-full text-[#666] hover:text-[#D4AF37] transition-colors"><ChevronLeft size={20} /></button>
        <div className="text-center"><input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="bg-transparent text-[#e5e5e5] font-bold text-lg text-center focus:outline-none font-mono tracking-tight" /></div>
        <button onClick={() => changeDate(1)} className="p-2 hover:bg-[#111] rounded-full text-[#666] hover:text-[#D4AF37] transition-colors"><ChevronRight size={20}/></button>
      </div>
      {/* ★ テンプレートボタン */}
      <div className="flex justify-center">
        <button onClick={() => setIsTemplateModalOpen(true)} className="bg-[#1a1a1a] border border-[#D4AF37]/30 text-[#D4AF37] px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#D4AF37]/10 transition-all flex items-center gap-2">
          <Copy size={14} /> テンプレート
        </button>
      </div>
      <div className="bg-[#0f0f0f] p-5 rounded shadow-2xl border border-[#222] space-y-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent opacity-70"></div>
        <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#D4AF37] flex items-center gap-2">{isCardio ? <Bike size={14}/> : <Activity size={14}/>} {isCardio ? "有酸素記録" : "セットを追加"}</h2>
            {isCardio === false && estimated1RM > 0 && (
                <div className="text-[9px] text-[#666] bg-[#111] px-2 py-1 rounded border border-[#222] tracking-wider">
                  EST. 1RM: <span className="text-[#D4AF37] font-mono font-bold text-xs ml-1">{estimated1RM}</span> KG
                </div>
           )}
        </div>
        <div className="relative"><input type="text" list="exercises" value={currentExerciseName} onChange={(e) => setCurrentExerciseName(e.target.value)} className="w-full bg-[#050505] border border-[#222] text-[#fff] p-3 rounded outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/20 transition-all placeholder-[#333] text-sm appearance-none" placeholder="種目を選択または入力"/><div className="absolute right-3 top-3 pointer-events-none text-[#444]">▼</div><datalist id="exercises">{SUGGESTED_EXERCISES.map(ex => <option key={ex} value={ex} />)}</datalist></div>
        
        {/* ★ NEW: 前回の記録表示 */}
        {currentExerciseName && (
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2">
              <div className="w-1 h-8 bg-gradient-to-b from-[#D4AF37] to-transparent rounded-full"></div>
              <div className="flex-1">
                <p className="text-[9px] text-[#555] uppercase tracking-wider mb-1">前回の記録</p>
                {getLastRecord ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-[#444]">({getLastRecord.date})</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {getLastRecord.sets.map((set: SetData, idx: number) => (
                        <div key={idx} className="flex items-baseline gap-1">
                          <span className="text-[10px] text-[#555] font-mono">#{idx + 1}</span>
                          {isCardio ? (
                            <>
                              <span className="text-[#D4AF37] font-mono font-bold text-sm">
                                {set.distanceKm || '--'}km
                              </span>
                              <span className="text-[#555] text-[10px]">×</span>
                              <span className="text-[#e5e5e5] font-mono font-bold text-sm">
                                {formatDuration(set.reps)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-[#D4AF37] font-mono font-bold text-sm">
                                {set.weight}kg
                              </span>
                              <span className="text-[#555] text-[10px]">×</span>
                              <span className="text-[#e5e5e5] font-mono font-bold text-sm">
                                {set.reps}回
                              </span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[#444] text-xs italic">前回の記録なし</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ★ NEW: AI予測アドバイザー */}
        {currentExerciseName && !isCardio && (
          <div className="relative">
            {/* AI予測ボタン */}
            {!showAiPanel && (
              <button
                onClick={fetchAiPrediction}
                disabled={getExerciseHistory.length < 3}
                className="w-full bg-gradient-to-r from-[#1a1a1a] to-[#0f0f0f] border border-[#D4AF37]/30 rounded-lg p-3 flex items-center justify-center gap-2 hover:border-[#D4AF37]/60 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Brain size={16} className="text-[#D4AF37] group-hover:animate-pulse" />
                <span className="text-[11px] text-[#888] group-hover:text-[#D4AF37] transition-colors">
                  {getExerciseHistory.length < 3 ? `AI予測にはあと${3 - getExerciseHistory.length}件の記録が必要` : 'AIが次回の目標を予測'}
                </span>
                <Sparkles size={12} className="text-[#D4AF37]/50 group-hover:text-[#D4AF37] transition-colors" />
              </button>
            )}

            {/* AI予測パネル */}
            {showAiPanel && (
              <div className="bg-gradient-to-br from-[#0f0f0f] via-[#111] to-[#0a0a0a] border border-[#D4AF37]/40 rounded-lg p-4 animate-in fade-in slide-in-from-top-2 duration-300 relative overflow-hidden">
                {/* ゴールドのグローエフェクト */}
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent"></div>
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#D4AF37]/5 rounded-full blur-3xl"></div>
                
                {/* ヘッダー */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-[#D4AF37]/20 rounded-full flex items-center justify-center">
                      <Brain size={16} className="text-[#D4AF37]" />
                    </div>
                    <div>
                      <h3 className="text-[11px] font-bold text-[#D4AF37] flex items-center gap-1">
                        AI 予測アドバイザー
                        <Zap size={10} className="text-[#ffcc00]" />
                      </h3>
                      <p className="text-[8px] text-[#555]">過去の成長曲線より算出</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowAiPanel(false); setAiPrediction(null); setAiError(null); }}
                    className="text-[#444] hover:text-white transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* ローディング状態 */}
                {isAiLoading && (
                  <div className="flex flex-col items-center justify-center py-6">
                    <div className="relative">
                      <div className="w-12 h-12 border-2 border-[#D4AF37]/20 rounded-full"></div>
                      <div className="absolute top-0 left-0 w-12 h-12 border-2 border-transparent border-t-[#D4AF37] rounded-full animate-spin"></div>
                      <Sparkles size={16} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#D4AF37] animate-pulse" />
                    </div>
                    <p className="text-[10px] text-[#666] mt-3 animate-pulse">データを分析中...</p>
                  </div>
                )}

                {/* エラー表示 */}
                {aiError && (
                  <div className="text-center py-4">
                    <p className="text-[11px] text-red-400">{aiError}</p>
                    <button
                      onClick={fetchAiPrediction}
                      className="mt-2 text-[10px] text-[#D4AF37] hover:underline"
                    >
                      再試行
                    </button>
                  </div>
                )}

                {/* 予測結果 */}
                {aiPrediction && !isAiLoading && (
                  <div className="space-y-3">
                    {/* 推奨値 */}
                    <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#222]">
                      <div className="flex items-center gap-1 mb-2">
                        <Target size={12} className="text-[#D4AF37]" />
                        <span className="text-[9px] text-[#555] uppercase tracking-wider">AI予測</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-mono font-black text-[#D4AF37]">
                          {aiPrediction.recommendedWeight}
                        </span>
                        <span className="text-sm text-[#666]">kg</span>
                        <span className="text-[#555] text-lg">×</span>
                        <span className="text-2xl font-mono font-bold text-[#e5e5e5]">
                          {aiPrediction.recommendedRepsMin}〜{aiPrediction.recommendedRepsMax}
                        </span>
                        <span className="text-sm text-[#666]">reps</span>
                      </div>
                      {/* 確信度 */}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-[#222] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#D4AF37] to-[#ffcc00] transition-all duration-1000"
                            style={{ width: `${aiPrediction.confidence}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-[#666]">確信度 {aiPrediction.confidence}%</span>
                      </div>
                    </div>



                    {/* 適用ボタン */}
                    <button
                      onClick={applyAiPrediction}
                      className="w-full bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 border border-[#D4AF37]/50 text-[#D4AF37] py-2 rounded text-[11px] font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <Zap size={12} />
                      この値を入力欄に適用
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {isCardio ? (
          <div className="animate-in fade-in slide-in-from-top-2">
            <label className="text-[10px] text-[#555] mb-2 block">タイム計測</label>
            <CardioStopwatch onTimeUpdate={setCardioSeconds} />
            <div className="flex gap-3 mt-4">
              <div className="flex-1 group">
                <label className="text-[10px] text-[#555] group-focus-within:text-[#D4AF37] mb-1 block transition-colors">距離 (km)</label>
                <input type="number" step="0.1" value={distanceInput} onChange={(e) => setDistanceInput(e.target.value)} className="w-full bg-[#050505] border border-[#222] text-white p-3 rounded font-mono text-lg focus:border-[#D4AF37] outline-none transition-all" placeholder="例: 5.0"/>
              </div>
              <div className="flex-1 group">
                <label className="text-[10px] text-[#555] group-focus-within:text-[#D4AF37] mb-1 block transition-colors">ギア / 負荷レベル</label>
                <input type="number" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} className="w-full bg-[#050505] border border-[#222] text-white p-3 rounded font-mono text-lg focus:border-[#D4AF37] outline-none transition-all" placeholder="例: 8"/>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 animate-in fade-in">
            <div className="flex-1 group relative">
              <label className="text-[10px] text-[#555] group-focus-within:text-[#D4AF37] mb-1 block transition-colors flex justify-between">重量 (kg)<button onClick={() => setIsCalcOpen(true)} className="text-[#D4AF37] hover:text-white flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity"><Calculator size={10} /> 計算</button></label>
              <input type="number" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} className="w-full bg-[#050505] border border-[#222] text-white p-3 rounded font-mono text-lg focus:border-[#D4AF37] outline-none transition-all" placeholder="0"/>
            </div>
            <div className="flex-1 group">
              <label className="text-[10px] text-[#555] group-focus-within:text-[#D4AF37] mb-1 block transition-colors">回数 (reps)</label>
              <input type="number" value={repsInput} onChange={(e) => setRepsInput(e.target.value)} className="w-full bg-[#050505] border border-[#222] text-white p-3 rounded font-mono text-lg focus:border-[#D4AF37] outline-none transition-all" placeholder="0"/>
            </div>
          </div>
        )}
        <button onClick={addSet} disabled={!currentExerciseName || (isCardio ? (cardioSeconds === 0 || !distanceInput) : (!weightInput || !repsInput))} className="w-full bg-[#D4AF37] hover:bg-[#b3932b] disabled:bg-[#222] disabled:text-[#444] text-black py-3 rounded font-bold text-sm shadow-[0_0_15px_rgba(212,175,55,0.2)] transition-all flex items-center justify-center gap-2 mt-2"><Plus size={16} /> {isCardio ? '結果を記録' : '記録を追加'}</button>
      </div>
      <PlateCalculatorModal isOpen={isCalcOpen} onClose={() => setIsCalcOpen(false)} targetWeight={parseFloat(weightInput) || 0} />
      <ShareReceiptModal isOpen={isReceiptOpen} onClose={() => setIsReceiptOpen(false)} session={currentSession} /> {/* ★ レシートモーダル */}
      <TemplateModal isOpen={isTemplateModalOpen} onClose={() => setIsTemplateModalOpen(false)} currentExercises={exercises} onLoadTemplate={handleLoadTemplate} userId={userId} />
      
      <div className="space-y-3">
        {exercises.length > 0 && (
            <div className="flex justify-end mb-2">
                <button 
                    onClick={() => setIsReceiptOpen(true)} 
                    className="flex items-center gap-1.5 text-[10px] bg-[#222] text-[#D4AF37] border border-[#D4AF37]/30 px-3 py-1.5 rounded hover:bg-[#D4AF37] hover:text-black transition-colors"
                >
                    <Share2 size={12} /> シェア用画像を生成
                </button>
            </div>
        )}
        
        {exercises.map((ex, exIndex) => (
          <div key={ex.id} className="bg-[#0f0f0f] rounded border border-[#222] overflow-hidden">
            <div className="bg-[#141414] px-4 py-2 flex justify-between items-center border-b border-[#222]"><span className="font-bold text-[#D4AF37] text-xs flex items-center gap-2">{CARDIO_EXERCISES.includes(ex.name) ? <Bike size={12}/> : null}{ex.name}</span><span className="text-[10px] text-[#555]">{ex.sets.length} sets</span></div>
            <div className="divide-y divide-[#1a1a1a]">
              {ex.sets.map((set: SetData & { isPR?: boolean }, setIndex: number) => {
                const isSetCardio = CARDIO_EXERCISES.includes(ex.name);
                const isEditing = editingSet?.exIndex === exIndex && editingSet?.setIndex === setIndex;
                return (
                  <div key={set.id} className="flex justify-between items-center p-3 hover:bg-[#161616] transition-colors">
                    <span className="text-[#444] w-6 font-mono text-[10px]">{(setIndex + 1).toString().padStart(2, '0')}</span>
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2 animate-in fade-in">
                        {isSetCardio ? (
                          <>
                            <input type="number" step="0.1" value={editDistance} onChange={(e) => setEditDistance(e.target.value)} className="w-16 bg-[#050505] border border-[#D4AF37] text-white p-1.5 rounded text-xs font-mono text-center" placeholder="km" />
                            <input type="number" value={editReps} onChange={(e) => setEditReps(e.target.value)} className="w-16 bg-[#050505] border border-[#D4AF37] text-white p-1.5 rounded text-xs font-mono text-center" placeholder="秒" />
                            <input type="number" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} className="w-14 bg-[#050505] border border-[#D4AF37] text-white p-1.5 rounded text-xs font-mono text-center" placeholder="Lv" />
                          </>
                        ) : (
                          <>
                            <input type="number" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} className="w-20 bg-[#050505] border border-[#D4AF37] text-white p-1.5 rounded text-xs font-mono text-center" placeholder="kg" />
                            <span className="text-[#555]">×</span>
                            <input type="number" value={editReps} onChange={(e) => setEditReps(e.target.value)} className="w-16 bg-[#050505] border border-[#D4AF37] text-white p-1.5 rounded text-xs font-mono text-center" placeholder="reps" />
                          </>
                        )}
                        <button onClick={() => saveEditSet(exIndex, setIndex)} className="text-green-500 hover:text-green-400 p-1"><CheckCircle2 size={16} /></button>
                        <button onClick={cancelEditSet} className="text-[#666] hover:text-white p-1"><X size={16} /></button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 flex items-baseline gap-3">
                          {isSetCardio ? (
                            <div className="flex items-baseline gap-3">
                              {set.distanceKm && <><span className="font-mono font-bold text-base text-[#e5e5e5] w-16 text-right">{set.distanceKm} <span className="text-[10px] text-[#444] font-sans font-normal">KM</span></span><span className="text-[#333]">/</span></>}
                              <span className="font-mono font-bold text-base text-[#e5e5e5] w-24 text-right">{formatDuration(set.reps)} <span className="text-[10px] text-[#444] font-sans font-normal">TIME</span></span>
                              <span className="text-[#333]">/</span>
                              <span className="font-mono font-bold text-base text-[#e5e5e5] w-12">Lv.{set.weight} <span className="text-[10px] text-[#444] font-sans font-normal">GEAR</span></span>
                            </div>
                          ) : (
                            <div className="flex items-baseline gap-3">
                              <span className="font-mono font-bold text-base text-[#e5e5e5] w-16 text-right">{set.weight} <span className="text-[10px] text-[#444] font-sans font-normal">kg</span></span><span className="text-[#333]">/</span>
                              <span className="font-mono font-bold text-base text-[#e5e5e5] w-12">{set.reps} <span className="text-[10px] text-[#444] font-sans font-normal">回</span></span>
                            </div>
                          )}
                        </div>
                        {(set as any).isPR && (
                          <Trophy size={14} className="text-[#D4AF37] shadow-[0_0_5px_#D4AF37]" />
                        )}
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEditSet(exIndex, setIndex, set)} className="text-[#444] hover:text-[#D4AF37] p-1.5 transition-colors"><Edit3 size={14} /></button>
                          <button onClick={() => removeSet(exIndex, setIndex)} className="text-[#333] hover:text-red-900 p-1.5 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {exercises.length === 0 && (<div className="py-8 text-center opacity-30"><Dumbbell size={32} className="mx-auto mb-2 text-[#333]" /><p className="text-[10px] text-[#666]">記録がありません</p></div>)}
      </div>
      <MetricCard initialWeight={bodyWeight} initialMemo={memo} onSave={handleMetricsSave} />
      
      {/* ★ NEW: PR演出モーダル */}
      {showPRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="relative animate-in zoom-in-95 fade-in duration-300">
            {/* 外側の光るリングエフェクト */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FF4500] blur-3xl opacity-60 animate-pulse"></div>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#FF4500] via-[#FFA500] to-[#FFD700] blur-2xl opacity-40 animate-spin" style={{animationDuration: '3s'}}></div>
            
            {/* メインコンテンツ */}
            <div className="relative bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-3xl p-12 border-4 border-[#FFD700] shadow-2xl">
              {/* パーティクルエフェクト */}
              <div className="absolute inset-0 overflow-hidden rounded-3xl">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-2 h-2 bg-[#FFD700] rounded-full animate-ping"
                    style={{
                      top: `${Math.random() * 100}%`,
                      left: `${Math.random() * 100}%`,
                      animationDelay: `${Math.random() * 2}s`,
                      animationDuration: `${1 + Math.random() * 2}s`
                    }}
                  />
                ))}
              </div>
              
              {/* トロフィーアイコン */}
              <div className="relative flex justify-center mb-6">
                <div className="relative">
                  <Trophy size={80} className="text-[#FFD700] drop-shadow-[0_0_20px_rgba(255,215,0,0.8)] animate-bounce" />
                  <div className="absolute inset-0 bg-[#FFD700] blur-xl opacity-50 animate-pulse"></div>
                </div>
              </div>
              
              {/* テキスト */}
              <div className="text-center space-y-4 relative z-10">
                <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FF4500] animate-pulse">
                  NEW RECORD!
                </h2>
                <div className="flex items-baseline justify-center gap-3">
                  <span className="text-6xl font-black font-mono text-[#FFD700] drop-shadow-[0_0_15px_rgba(255,215,0,0.8)]">
                    {prValue}
                  </span>
                  <span className="text-3xl font-bold text-[#FFA500]">{prUnit}</span>
                </div>
                <div className="flex justify-center gap-2 mt-4">
                  <Zap size={24} className="text-[#FFD700] animate-pulse" />
                  <Sparkles size={24} className="text-[#FFA500] animate-pulse" style={{animationDelay: '0.2s'}} />
                  <Zap size={24} className="text-[#FF4500] animate-pulse" style={{animationDelay: '0.4s'}} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CalendarScreen = ({ workouts, onDateSelect }: any) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);
  const getLog = (day: number) => { const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return workouts.find((w: WorkoutSession) => w.date === dateStr); };
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="bg-[#0f0f0f] rounded p-5 shadow-2xl border border-[#222]">
        <div className="flex justify-between items-center mb-6"><button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 hover:bg-[#1a1a1a] rounded text-[#666] hover:text-[#D4AF37]"><ChevronLeft size={18}/></button><div className="text-center"><h2 className="text-lg font-bold text-[#D4AF37] font-mono tracking-tight">{year}年 {month + 1}月</h2></div><button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 hover:bg-[#1a1a1a] rounded text-[#666] hover:text-[#D4AF37]"><ChevronRight size={18}/></button></div>
        <div className="grid grid-cols-7 gap-2 mb-2">{['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (<div key={d} className={`text-center text-[10px] font-bold ${i === 0 ? 'text-red-900' : 'text-[#444]'}`}>{d}</div>))}</div>
        <div className="grid grid-cols-7 gap-2">
          {blanks.map(i => <div key={`blank-${i}`} className="aspect-square"></div>)}
          {days.map(day => {
            const log = getLog(day);
            const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            return (<button key={day} onClick={() => onDateSelect(dateStr)} className={`aspect-square rounded flex flex-col items-center justify-center relative transition-all duration-300 group ${log ? 'bg-[#D4AF37]/10 border border-[#D4AF37]/40' : 'bg-[#161616] text-[#444] hover:bg-[#222] border border-transparent'}`}><span className={`text-xs font-mono ${log ? 'text-[#D4AF37] font-bold' : 'text-[#444] group-hover:text-[#888]'}`}>{day}</span>{log && (<div className="mt-1 w-1 h-1 rounded-full bg-[#D4AF37] shadow-[0_0_8px_#D4AF37]"></div>)}{isToday && !log && (<div className="absolute top-1 right-1 w-1 h-1 bg-blue-500 rounded-full"></div>)}</button>);
          })}
        </div>
      </div>
    </div>
  );
};

const StatsScreen = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const [chartMode, setChartMode] = useState<'max' | 'volume'>('max'); 
  const uniqueExercises = useMemo(() => { const names = new Set<string>(); workouts.forEach(w => w.exercises?.forEach(e => names.add(e.name))); const list = Array.from(names); return list.sort(); }, [workouts]);
  const [selectedExercise, setSelectedExercise] = useState<string>('');
  useEffect(() => { if (!selectedExercise && uniqueExercises.length > 0) { setSelectedExercise(uniqueExercises[0]); } }, [uniqueExercises, selectedExercise]);
  const chartData = useMemo(() => {
    const sortedWorkouts = [...workouts].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return sortedWorkouts.map(w => {
      const exercise = w.exercises?.find(e => e.name === selectedExercise);
      if (!exercise) return null;
      const maxWeight = Math.max(...exercise.sets.map(s => s.weight));
      const totalVolume = exercise.sets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
      return { date: w.date.substring(5).replace('-', '/'), maxWeight, totalVolume };
    }).filter(Boolean);
  }, [workouts, selectedExercise]);
  if (uniqueExercises.length === 0) return <div className="flex flex-col items-center justify-center h-64 text-[#444] space-y-4"><Activity size={48} className="text-[#222]" /><p className="text-[10px] uppercase tracking-wider">データがありません</p></div>;
  const isCardioSelected = CARDIO_EXERCISES.includes(selectedExercise);
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      {/* ★ NEW: 週間ボリューム推移 */}
      <WeeklyVolumeChart workouts={workouts} />
      <div className="bg-[#0f0f0f] p-4 rounded border border-[#222]"><label className="text-[10px] text-[#666] block mb-2 font-bold">分析する種目</label><div className="relative"><select value={selectedExercise} onChange={(e) => setSelectedExercise(e.target.value)} className="w-full bg-[#050505] text-[#e5e5e5] p-3 rounded border border-[#222] focus:border-[#D4AF37] outline-none appearance-none text-sm">{uniqueExercises.map(name => <option key={name} value={name}>{name}</option>)}</select><div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#666]">▼</div></div></div>
      <div className="flex bg-[#0a0a0a] p-1 rounded border border-[#222]"><button onClick={() => setChartMode('max')} className={`flex-1 py-2 text-xs font-bold rounded transition-all ${chartMode === 'max' ? 'bg-[#D4AF37] text-black shadow' : 'text-[#666]'}`}>{isCardioSelected ? '最大ギア/負荷' : '最大重量 (Max)'}</button><button onClick={() => setChartMode('volume')} className={`flex-1 py-2 text-xs font-bold rounded transition-all ${chartMode === 'volume' ? 'bg-[#D4AF37] text-black shadow' : 'text-[#666]'}`}>{isCardioSelected ? '総運動量 (負荷×時間)' : '総負荷量 (Volume)'}</button></div>
      <div className="bg-[#0f0f0f] p-2 rounded border border-[#222] h-80 relative shadow-2xl overflow-hidden"><div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#D4AF37]/50 to-transparent"></div><div className="absolute top-4 left-6 flex items-center gap-2 text-[10px] font-bold z-10 pointer-events-none"><div className="w-2 h-2 bg-[#D4AF37]"></div><span className="text-[#D4AF37]">{chartMode === 'max' ? (isCardioSelected ? 'MAX GEAR (Lv)' : 'MAX WEIGHT (kg)') : 'TOTAL VOLUME'}</span></div><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 40, right: 10, left: -10, bottom: 0 }}><defs><linearGradient id="colorMain" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#D4AF37" stopOpacity={0.4}/><stop offset="95%" stopColor="#D4AF37" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="2 4" stroke="#222" vertical={false} /><XAxis dataKey="date" stroke="#444" fontSize={9} tick={{fill: '#444'}} tickMargin={10} axisLine={false} tickLine={false} /><YAxis stroke="#444" fontSize={9} tick={{fill: '#444'}} domain={['dataMin', 'auto']} axisLine={false} tickLine={false} /><RechartsTooltip content={({ active, payload, label }) => { if (active && payload && payload.length) { const data = payload[0].payload; return (<div className="bg-[#000] border border-[#333] p-3 shadow-xl rounded"><div className="text-[#666] text-[9px] mb-1 font-mono">{label}</div><div className="text-[#D4AF37] font-bold text-sm font-mono mb-1">{chartMode === 'max' ? `${data.maxWeight} ${isCardioSelected ? 'Lv' : 'kg'}` : `${data.totalVolume}`}</div></div>); } return null; }} /><Area type="monotone" dataKey={chartMode === 'max' ? 'maxWeight' : 'totalVolume'} stroke="#D4AF37" strokeWidth={2} fillOpacity={1} fill="url(#colorMain)" animationDuration={1000} /></AreaChart></ResponsiveContainer></div>
    </div>
  );
};

// --- Main App Component (Default Export) ---

export default function TrainingLogAppDeploy() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'record' | 'calendar' | 'stats'>('record');
  const [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const [targetDate, setTargetDate] = useState<string>(formatDate(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'error'>('synced');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false); // 認証モーダル

  // ★ NEW: ランク情報計算 ★
  const totalVolume = useMemo(() => calculateTotalVolume(workouts), [workouts]);
  const rankInfo = useMemo(() => getRankInfo(totalVolume), [totalVolume]);
  // ★ NEW: 総距離計算 ★
  const totalDistance = useMemo(() => calculateTotalDistance(workouts), [workouts]);
  // ★ NEW: トラベル進捗計算 ★
  const travelProgress = useMemo(() => getTravelProgress(totalDistance), [totalDistance]);

  // ★ NEW: PR判定用の最大ボリュームマップを事前に計算 ★
  const maxVolumeMap = useMemo(() => {
    const map: { [key: string]: number } = {};
    workouts.forEach(w => {
        w.exercises?.forEach(e => {
            e.sets.forEach(set => {
                if (CARDIO_EXERCISES.includes(e.name)) {
                    // 有酸素: 最大距離(km)をトラッキング
                    const distance = set.distanceKm || 0;
                    if (distance > (map[e.name] || 0)) {
                        map[e.name] = distance;
                    }
                } else {
                    const volume = set.weight * set.reps;
                    if (volume > (map[e.name] || 0)) {
                        map[e.name] = volume;
                    }
                }
            });
        });
    });
    return map;
  }, [workouts]);
  
  useEffect(() => {
    // Auth state listener
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        await signInAnonymously(auth);
      } else {
        setUser(u);
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const collectionPath = collection(db, 'users', user.uid, 'workouts');
    const q = query(collectionPath);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedWorkouts: WorkoutSession[] = [];
      snapshot.forEach((doc) => {
        loadedWorkouts.push(doc.data() as WorkoutSession);
      });
      setWorkouts(loadedWorkouts);
      setIsLoading(false);
    }, (error) => {
      console.error("Data fetch error:", error);
      setSyncStatus('error');
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const handleLogout = async () => {
    if(window.confirm("ログアウトしますか？")) {
      await signOut(auth);
    }
  };

  const saveWorkoutSession = async (session: WorkoutSession) => {
    if (!user) return;
    setSyncStatus('saving');
    setWorkouts(prev => {
      const existingIndex = prev.findIndex(w => w.date === session.date);
      if (existingIndex >= 0) {
        const newWorkouts = [...prev];
        newWorkouts[existingIndex] = session;
        return newWorkouts;
      }
      return [...prev, session];
    });

    try {
      const collectionPath = collection(db, 'users', user.uid, 'workouts');
      await setDoc(doc(collectionPath, session.date), {
        ...session,
        updatedAt: Date.now()
      });
      setTimeout(() => setSyncStatus('synced'), 500);
    } catch (e) {
      console.error("Save error:", e);
      setSyncStatus('error');
      alert("保存に失敗しました。\n理由: " + (e as Error).message);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-[#D4AF37]">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin mx-auto mb-4"/>
          <p className="text-xs font-mono uppercase tracking-widest">Loading Data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#e5e5e5] font-sans pb-24 relative selection:bg-[#D4AF37]/30">
        <EmailAuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuth={() => {}} />
      
      <header className="bg-[#0a0a0a]/90 backdrop-blur-xl p-4 border-b border-[#222] sticky top-0 z-30 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-[#D4AF37] to-[#8a6e2f] p-1.5 rounded text-black shadow-[0_0_10px_rgba(212,175,55,0.3)]">
            <Dumbbell size={18} strokeWidth={3} />
          </div>
          <h1 className="text-lg font-bold tracking-widest text-[#D4AF37] font-sans uppercase hidden sm:block">
            Training Log
          </h1>
          <h1 className="text-lg font-bold tracking-widest text-[#D4AF37] font-sans uppercase sm:hidden">
            LOG
          </h1>
        </div>
        <div className="flex items-center gap-3">
           <div className={`hidden sm:flex text-[9px] items-center gap-1 transition-colors ${
             syncStatus === 'saving' ? 'text-yellow-500' : 
             syncStatus === 'error' ? 'text-red-500' : 'text-green-500'
           }`}>
             {syncStatus === 'saving' ? <Loader2 size={10} className="animate-spin"/> : <Cloud size={10}/>}
             {syncStatus === 'saving' ? 'Saving...' : syncStatus === 'error' ? 'Error' : 'Synced'}
           </div>

           {/* ★ AUTH CHANGE: メール/パスワード認証ボタン ★ */}
           {user?.isAnonymous ? (
             <button onClick={() => setIsAuthModalOpen(true)} className="flex items-center gap-1.5 bg-[#D4AF37] text-black px-3 py-1.5 rounded font-bold text-xs hover:bg-[#b3932b] transition-colors">
               <Mail size={12} /> Emailで連携
             </button>
           ) : (
             <button onClick={handleLogout} className="flex items-center gap-1.5 bg-[#222] text-[#888] border border-[#333] px-3 py-1.5 rounded font-bold text-xs hover:text-white transition-colors">
               <UserIcon size={12} /> {user?.email ? user.email.split('@')[0] : 'User'}
             </button>
           )}
        </div>
      </header>

      <main className="p-4 max-w-md mx-auto">
        
        {/* ★ 制約対応: Rank/Travel/Weight CardはRecordタブでのみ表示 ★ */}
        {activeTab === 'record' && (
            <>
                {/* ★ NEW: 体重トレンドカード (改良案C) ★ */}
                <BodyWeightTrendCard workouts={workouts} />

                {/* ★ NEW: 連続トレーニング日数 ★ */}
                <StreakCard workouts={workouts} />

                {/* ★ NEW: トレーニング・ヒートマップ ★ */}
                <TrainingHeatmap workouts={workouts} />

                {/* ★ NEW: 部位別レーダーチャート ★ */}
                <TrainingRadarChart workouts={workouts} />

                {/* ランク表示カード */}
                <div className="mb-6 bg-[#0f0f0f] border border-[#222] rounded-xl p-4 relative overflow-hidden shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex justify-between items-center relative z-10">
                    <div className='flex items-center gap-2'>
                      <Trophy size={20} className={rankInfo.current.color} />
                      <div>
                        <p className="text-[10px] text-[#555] uppercase tracking-widest mb-1">Current Rank</p>
                        <h3 className={`text-xl font-black italic tracking-tighter ${rankInfo.current.color}`}>
                          {rankInfo.current.name}
                        </h3>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-mono font-bold text-[#D4AF37]">{totalVolume.toLocaleString()}</p>
                      <p className="text-[10px] text-[#555] uppercase tracking-widest">Total Volume (kg)</p>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  {rankInfo.next && (
                    <div className="mt-4">
                        <p className="text-[9px] text-[#555] mb-1 font-bold">NEXT: {rankInfo.next.name} (残り {rankInfo.remaining.toLocaleString()} kg)</p>
                        <div className="h-1.5 w-full bg-[#222] rounded-full overflow-hidden">
                            <div 
                                className={`h-full ${rankInfo.current.bg} transition-all duration-1000 ease-out`}
                                style={{ width: `${rankInfo.progress}%` }}
                            />
                        </div>
                    </div>
                  )}

                  {/* Background Glow */}
                  <div className={`absolute -right-4 -bottom-4 w-24 h-24 ${rankInfo.current.bg} blur-[50px] opacity-10`} />
                </div>
                {/* ランク表示カード END */}
                
                {/* 地球儀トラベル進捗カード */}
                <div className="mb-6 bg-[#0f0f0f] border border-[#222] rounded-xl p-4 relative overflow-hidden shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
                  
                  {/* 地球儀タイトル */}
                  <div className="flex justify-between items-center relative z-10 mb-4">
                    <div className='flex items-center gap-2'>
                      <Globe size={20} className='text-[#00ffff]' />
                      <div>
                        <p className="text-[10px] text-[#555] uppercase tracking-widest mb-1">TOTAL DISTANCE</p>
                        <h3 className={`text-xl font-black italic tracking-tighter text-[#00ffff]`}>
                          {totalDistance.toFixed(1).toLocaleString()} <span className='text-sm text-[#555] font-sans'>km</span>
                        </h3>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-[#555] uppercase tracking-widest mb-1">WORLD TOUR</p>
                      <p className={`text-lg font-mono font-bold ${travelProgress.isCompleted ? 'text-green-500' : 'text-yellow-500'}`}>
                        {travelProgress.isCompleted ? "COMPLETED" : "旅行中"}
                      </p>
                    </div>
                  </div>

                  {/* 地球儀 進捗表示 */}
                  <div className='relative overflow-hidden pt-4 pb-2 border-t border-[#1a1a1a]'>
                    
                    {/* 現在地と目的地 */}
                    <div className='flex justify-between items-center mb-1 text-xs font-bold'>
                        <div className='flex items-center gap-1 text-[#444]'>
                            <MapPin size={12} className='text-[#666]' />
                            <span>{travelProgress.currentCity}</span>
                        </div>
                        <div className='flex items-center gap-1 text-[#00ffff]'>
                            <span>{travelProgress.nextTarget.target}</span>
                            <MapPin size={12} className='text-[#00ffff] animate-pulse' />
                        </div>
                    </div>

                    {/* 進捗バー */}
                    <div className="h-2 w-full bg-[#222] rounded-full overflow-hidden mb-2">
                        <div 
                            className={`h-full bg-gradient-to-r from-[#00ffff]/30 to-[#00ffff] transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(0,255,255,0.8)]`}
                            style={{ width: `${travelProgress.progress}%` }}
                        />
                    </div>
                    
                    {/* 残り距離 */}
                    <p className="text-[10px] text-[#666] text-right font-mono">
                        NEXT: {travelProgress.remainingDistance.toLocaleString()} km
                    </p>

                    {/* 目的地リスト (ミニマップ) */}
                    <div className='flex gap-2 mt-4 pt-3 border-t border-[#1a1a1a] overflow-x-auto whitespace-nowrap text-[9px]'>
                        {TRAVEL_DESTINATIONS.map((dest, index) => {
                            let status = 'pending';
                            if (index < travelProgress.currentDestinationIndex) status = 'completed';
                            if (index === travelProgress.currentDestinationIndex) status = 'current';

                            return (
                                <div key={dest.name} className='flex flex-col items-center flex-shrink-0 w-16'>
                                    <div className={`p-1 rounded-full transition-colors ${status === 'completed' ? 'bg-green-600/50' : status === 'current' ? 'bg-[#00ffff]/50 animate-pulse' : 'bg-[#111]'}`}>
                                        {status === 'completed' ? <CheckCircle size={12} className='text-green-400' /> : <MapPin size={12} className={status === 'current' ? 'text-[#00ffff]' : 'text-[#444]'} />}
                                    </div>
                                    <span className={`mt-1 font-bold ${status === 'completed' ? 'text-green-500' : status === 'current' ? 'text-[#00ffff]' : 'text-[#444]'}`}>
                                        {dest.target || dest.name}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                  </div>
                </div>
                {/* 地球儀トラベル進捗カード END */}
            </>
        )}
        {/* ★ 制約対応 END ★ */}

        {activeTab === 'record' && (
          <RecordScreen
            targetDate={targetDate}
            setTargetDate={setTargetDate}
            workouts={workouts}
            onSave={saveWorkoutSession}
            maxVolumeMap={maxVolumeMap}
            userId={user?.uid || null}
          />
        )}
        {activeTab === 'calendar' && (
          <CalendarScreen 
            workouts={workouts} 
            onDateSelect={(d: string) => { setTargetDate(d); setActiveTab('record'); }}
          />
        )}
        {activeTab === 'stats' && (
          <StatsScreen workouts={workouts} />
        )}
      </main>

      <TimerOverlay />

      <nav className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a] border-t border-[#222] flex justify-around py-3 pb-safe z-40 shadow-[0_-20px_40px_rgba(0,0,0,0.9)]">
        <NavButton icon={<Edit3 />} label="記録" active={activeTab === 'record'} onClick={() => setActiveTab('record')} />
        <NavButton icon={<CalendarIcon />} label="カレンダー" active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
        <NavButton icon={<TrendingUp />} label="実績推移" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} />
      </nav>
    </div>
  );
}