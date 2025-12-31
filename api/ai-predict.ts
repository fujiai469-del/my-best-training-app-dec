import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// 環境変数からAPIキーを取得
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// トレーニングデータの型定義
interface SetData {
  weight: number;
  reps: number;
  date: string;
}

interface ExerciseHistory {
  exerciseName: string;
  history: SetData[];
}

interface PredictionRequest {
  exerciseName: string;
  history: SetData[];
}

// 2kg刻みに丸める関数
const roundToTwoKg = (weight: number): number => {
  return Math.round(weight / 2) * 2;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORSヘッダーを設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { exerciseName, history } = req.body as PredictionRequest;

    if (!exerciseName || !history || history.length === 0) {
      return res.status(400).json({ error: '種目名と履歴データが必要です' });
    }

    // 履歴データを整形
    const historyText = history
      .slice(-20) // 直近20件のみ使用
      .map((h, i) => `${i + 1}. ${h.date}: ${h.weight}kg × ${h.reps}回`)
      .join('\n');

    // 最新の記録を取得
    const latestRecord = history[history.length - 1];
    const avgWeight = history.reduce((sum, h) => sum + h.weight, 0) / history.length;
    const avgReps = history.reduce((sum, h) => sum + h.reps, 0) / history.length;
    const maxWeight = Math.max(...history.map(h => h.weight));

    // プロンプトを作成
    const prompt = `あなたは経験豊富なパーソナルトレーナーです。以下のトレーニング履歴を分析し、次回のトレーニングの目標を提案してください。

【種目】${exerciseName}

【トレーニング履歴】
${historyText}

【統計情報】
- 平均重量: ${avgWeight.toFixed(1)}kg
- 平均回数: ${avgReps.toFixed(1)}回
- 最大重量: ${maxWeight}kg
- 直近の記録: ${latestRecord.weight}kg × ${latestRecord.reps}回

【制約条件】
1. 提案する重量は必ず2kg単位（例：60, 62, 64...）としてください。
2. 安全性を考慮し、急激な重量増加は避けてください。
3. 過去の成長曲線から、今日のコンディションで達成可能な目標を提案してください。
4. reasoningとadviceは、自然な日本語で作成してください。「去の成長」のような不自然な略称は使わず「過去の成長」としてください。

【回答形式】
以下のJSON形式で回答してください：
{
  "recommendedWeight": <2kg刻みの推奨重量（数値）>,
  "recommendedRepsMin": <推奨回数の下限（数値）>,
  "recommendedRepsMax": <推奨回数の上限（数値）>,
  "confidence": <予測の確信度 0-100（数値）>,
  "reasoning": "<50文字以内の簡潔な理由>",
  "advice": "<30文字以内のアドバイス>"
}`;

    // OpenAI APIを呼び出し
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // 軽量モデルを使用
      messages: [
        {
          role: 'system',
          content: 'あなたは筋トレの専門家です。JSON形式のみで回答してください。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    let prediction;
    
    try {
      prediction = JSON.parse(responseText);
    } catch {
      // JSONパースに失敗した場合はデフォルト値を返す
      prediction = {
        recommendedWeight: roundToTwoKg(latestRecord.weight),
        recommendedRepsMin: Math.max(1, latestRecord.reps - 2),
        recommendedRepsMax: latestRecord.reps + 2,
        confidence: 50,
        reasoning: '過去のトレーニング履歴に基づく推定です。',
        advice: 'まずはこの設定でフォームを意識して行いましょう。'
      };
    }

    // 重量を2kg刻みに丸める
    prediction.recommendedWeight = roundToTwoKg(prediction.recommendedWeight);

    return res.status(200).json({
      success: true,
      prediction,
      exerciseName,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('AI Prediction Error:', error);
    
    // APIキーが設定されていない場合のエラー
    if (error.code === 'invalid_api_key' || !process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'OpenAI APIキーが設定されていません',
        details: '環境変数 OPENAI_API_KEY を設定してください'
      });
    }

    return res.status(500).json({
      error: 'AI予測の生成に失敗しました',
      details: error.message
    });
  }
}
