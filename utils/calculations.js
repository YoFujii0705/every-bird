const moment = require('moment');
const sheetsUtils = require('./sheets');
const config = require('../config.json');

// 週の始まりを月曜日に設定（安全な方法）
try {
    moment.updateLocale('en', {
        week: {
            dow: 1, // Monday is the first day of the week
            doy: 4  // The week that contains Jan 4th is the first week of the year
        }
    });
} catch (error) {
    console.warn('Moment locale setting failed, using default:', error.message);
}

// ===== 気分関連計算 =====

function calculateAverageMood(entries) {
    const moodValues = { '😊': 5, '🙂': 4, '😐': 3, '😔': 2, '😞': 1 };
    const validEntries = entries.filter(entry => entry.mood && moodValues[entry.mood]);
    
    if (validEntries.length === 0) return '未記録';
    
    const sum = validEntries.reduce((acc, entry) => acc + moodValues[entry.mood], 0);
    const avg = sum / validEntries.length;
    
    if (avg >= 4.5) return '😊 とても良い';
    if (avg >= 3.5) return '🙂 良い';
    if (avg >= 2.5) return '😐 普通';
    if (avg >= 1.5) return '😔 悪い';
    return '😞 とても悪い';
}

function countMoodDays(entries, targetMood) {
    return entries.filter(entry => entry.mood === targetMood).length;
}

// ===== 体重関連計算 =====

function calculateWeightChangeFromEntries(entries) {
    if (entries.length < 2) return '変化なし';
    
    const firstWeight = parseFloat(entries[0].weight);
    const lastWeight = parseFloat(entries[entries.length - 1].weight);
    const change = lastWeight - firstWeight;
    
    if (change > 0) return `+${change.toFixed(1)}kg`;
    if (change < 0) return `${change.toFixed(1)}kg`;
    return '変化なし';
}

function calculateBMI(weight, height) {
    if (!weight || !height || height <= 0) return null;
    const heightInM = height / 100;
    return weight / (heightInM * heightInM);
}

function getBMICategory(bmi) {
    if (!bmi) return '未設定';
    if (bmi < 18.5) return '低体重';
    if (bmi <= 24.9) return '標準';
    if (bmi <= 29.9) return '過体重';
    return '肥満';
}

function getHealthyWeightRange(height) {
    if (!height || height <= 0) return null;
    const heightInM = height / 100;
    const minWeight = 18.5 * heightInM * heightInM;
    const maxWeight = 24.9 * heightInM * heightInM;
    
    return {
        min: minWeight.toFixed(1),
        max: maxWeight.toFixed(1)
    };
}

// 安全な減量ペースの計算
function calculateSafeWeightLossRate(currentWeight, targetWeight, timeframeWeeks) {
    const weightDifference = currentWeight - targetWeight;
    const weeklyRate = Math.abs(weightDifference) / timeframeWeeks;
    
    // 推奨: 週0.5-1kg
    const isHealthyRate = weeklyRate >= 0.25 && weeklyRate <= 1.0;
    
    return {
        weeklyRate: weeklyRate.toFixed(2),
        isHealthy: isHealthyRate,
        recommendation: isHealthyRate ? 
            '健康的なペースです' : 
            weeklyRate > 1.0 ? 
                '減量ペースが早すぎます。週0.5-1kgが理想的です。' :
                '減量ペースが遅すぎます。週0.5-1kgが理想的です。'
    };
}

// 体重目標の妥当性チェック
function validateWeightGoal(currentWeight, targetWeight, height, targetDate) {
    const bmi = calculateBMI(targetWeight, height);
    const healthyRange = getHealthyWeightRange(height);
    
    const today = moment();
    const target = moment(targetDate);
    const weeksToTarget = target.diff(today, 'weeks');
    
    if (weeksToTarget <= 0) {
        return {
            isValid: false,
            warnings: ['目標日が過去または今日です'],
            suggestions: []
        };
    }
    
    const weightLossRate = calculateSafeWeightLossRate(currentWeight, targetWeight, weeksToTarget);
    
    const warnings = [];
    const suggestions = [];
    
    // BMI範囲チェック
    if (bmi && (bmi < 18.5 || bmi > 24.9)) {
        warnings.push(`目標体重のBMI: ${bmi.toFixed(1)} (${getBMICategory(bmi)})`);
        if (healthyRange) {
            suggestions.push(`健康的な体重範囲: ${healthyRange.min}-${healthyRange.max}kg`);
        }
    }
    
    // 減量ペースチェック
    if (!weightLossRate.isHealthy) {
        warnings.push(weightLossRate.recommendation);
        
        // 適切な目標の提案
        const safeWeeklyLoss = 0.75; // 週0.75kg（健康的な範囲の中央値）
        const safeTotalLoss = safeWeeklyLoss * weeksToTarget;
        const suggestedWeight = currentWeight - safeTotalLoss;
        
        if (suggestedWeight > targetWeight) {
            suggestions.push(`より安全な目標: ${suggestedWeight.toFixed(1)}kg`);
        } else {
            const safeTimeframe = Math.ceil(Math.abs(currentWeight - targetWeight) / safeWeeklyLoss);
            const safeTargetDate = moment().add(safeTimeframe, 'weeks');
            suggestions.push(`より安全な期間: ${safeTargetDate.format('YYYY年MM月DD日')}まで`);
        }
    }
    
    return {
        isValid: warnings.length === 0,
        warnings,
        suggestions,
        weeklyRate: weightLossRate.weeklyRate,
        bmi: bmi ? bmi.toFixed(1) : null,
        bmiCategory: getBMICategory(bmi)
    };
}

// 体重グラフ生成（改良版）
function generateWeightGraph(entries, targetWeight = null) {
    if (entries.length < 2) return '十分なデータがありません（最低2日分必要）';
    
    const weights = entries.map(e => parseFloat(e.weight)).filter(w => !isNaN(w));
    if (weights.length < 2) return 'valid な体重データが不足しています';
    
    let minWeight = Math.min(...weights);
    let maxWeight = Math.max(...weights);
    
    // 目標体重がある場合は範囲に含める
    if (targetWeight && !isNaN(targetWeight)) {
        minWeight = Math.min(minWeight, targetWeight);
        maxWeight = Math.max(maxWeight, targetWeight);
    }
    
    const range = maxWeight - minWeight;
    
    if (range === 0) {
        return `📊 体重: ${minWeight}kg （変化なし）\n${'─'.repeat(30)}`;
    }
    
    let graph = '';
    const graphHeight = 8;
    const graphWidth = Math.min(entries.length, 25);
    
    // Y軸ラベルとグラフ
    for (let i = graphHeight; i >= 0; i--) {
        const value = minWeight + (range * i / graphHeight);
        graph += `${value.toFixed(1).padStart(5)} │`;
        
        // データポイント
        for (let j = 0; j < graphWidth; j++) {
            if (j >= weights.length) {
                graph += ' ';
                continue;
            }
            
            const weight = weights[j];
            const normalizedHeight = Math.round((weight - minWeight) / range * graphHeight);
            
            if (normalizedHeight === i) {
                graph += '●';
            } else if (j > 0) {
                const prevWeight = weights[j - 1];
                const prevHeight = Math.round((prevWeight - minWeight) / range * graphHeight);
                
                // 線を描画
                const minH = Math.min(normalizedHeight, prevHeight);
                const maxH = Math.max(normalizedHeight, prevHeight);
                
                if (i >= minH && i <= maxH) {
                    graph += '│';
                } else {
                    graph += ' ';
                }
            } else {
                graph += ' ';
            }
        }
        
        // 目標線の表示
        if (targetWeight && !isNaN(targetWeight)) {
            const targetHeight = Math.round((targetWeight - minWeight) / range * graphHeight);
            if (targetHeight === i) {
                graph += ' 🎯';
            }
        }
        
        graph += '\n';
    }
    
    // X軸
    graph += '      └';
    for (let i = 0; i < graphWidth; i++) {
        graph += '─';
    }
    graph += '\n';
    
    // 日付ラベル（改良版）
    if (entries.length >= 2) {
        const firstDate = moment(entries[0].date).format('MM/DD');
        const lastDate = moment(entries[entries.length - 1].date).format('MM/DD');
        
        graph += `       ${firstDate}`;
        const spaces = Math.max(0, graphWidth - firstDate.length - lastDate.length - 2);
        graph += ' '.repeat(spaces);
        if (graphWidth > firstDate.length + 2) {
            graph += lastDate;
        }
    }
    
    return graph;
}

// ===== 習慣関連計算 =====

async function calculateBestStreak(userId, habitId) {
    try {
        const logs = await sheetsUtils.getHabitLogs(userId, habitId);
        if (!logs || logs.length === 0) return 0;
        
        // 日付でソート
        const sortedLogs = logs.sort((a, b) => moment(a.date).diff(moment(b.date)));
        
        let maxStreak = 0;
        let currentStreak = 0;
        let lastDate = null;
        
        for (const log of sortedLogs) {
            const logDate = moment(log.date);
            
            if (lastDate === null) {
                currentStreak = 1;
            } else {
                const daysDiff = logDate.diff(lastDate, 'days');
                if (daysDiff === 1) {
                    currentStreak++;
                } else {
                    maxStreak = Math.max(maxStreak, currentStreak);
                    currentStreak = 1;
                }
            }
            
            lastDate = logDate;
        }
        
        return Math.max(maxStreak, currentStreak);
    } catch (error) {
        console.error('Best streak calculation error:', error);
        return 0;
    }
}

// 現在のストリーク計算
async function calculateCurrentStreak(userId, habitId) {
    try {
        const logs = await sheetsUtils.getHabitLogs(userId, habitId);
        if (!logs || logs.length === 0) return 0;
        
        // 日付でソート（新しい順）
        const sortedLogs = logs.sort((a, b) => moment(b.date).diff(moment(a.date)));
        
        const today = moment().startOf('day');
        let currentStreak = 0;
        
        for (let i = 0; i < sortedLogs.length; i++) {
            const logDate = moment(sortedLogs[i].date).startOf('day');
            const expectedDate = today.clone().subtract(i, 'days');
            
            if (logDate.isSame(expectedDate)) {
                currentStreak++;
            } else {
                break;
            }
        }
        
        return currentStreak;
    } catch (error) {
        console.error('Current streak calculation error:', error);
        return 0;
    }
}

// ✅ 修正：関数の引数として受け取るように変更
async function generateHabitCalendar(userId, year, month, sheetsUtils, specificHabitName = null) {
    const startDate = moment(`${year}-${String(month).padStart(2, '0')}-01`); // 日付フォーマット修正
    const endDate = startDate.clone().endOf('month');
    const daysInMonth = endDate.date();
    
    // 指定された習慣または全習慣を取得
    let habits;
    if (specificHabitName) {
        const habit = await sheetsUtils.getHabitByName(userId, specificHabitName);
        habits = habit ? [habit] : [];
    } else {
        habits = await sheetsUtils.getUserHabits(userId);
    }
    
    if (habits.length === 0) {
        return {
            description: specificHabitName ? '指定された習慣が見つかりません。' : '登録された習慣がありません。',
            display: 'データがありません。'
        };
    }
    
    // 該当月の習慣ログと日記を取得
    const habitLogs = await sheetsUtils.getHabitLogsInRange(userId, startDate.format('YYYY-MM-DD'), endDate.format('YYYY-MM-DD'));
    const diaryEntries = await sheetsUtils.getDiaryEntriesInRange(userId, startDate.format('YYYY-MM-DD'), endDate.format('YYYY-MM-DD'));
    
    // カレンダー表示を生成（月曜始まり）
    let calendarDisplay = '```\n';
    calendarDisplay += '月 火 水 木 金 土 日\n';
    
    // 月の最初の日の曜日を取得（1=月曜日基準）
    const firstDayWeekday = (startDate.day() + 6) % 7; // 月曜日=0になるよう調整
    
    // 最初の週の空白を追加
    for (let i = 0; i < firstDayWeekday; i++) {
        calendarDisplay += '   ';
    }
    
    // 各日付を処理
    for (let day = 1; day <= daysInMonth; day++) {
        // ✅ 日付フォーマット修正：必ず2桁にする
        const currentDate = moment(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
        const dateStr = currentDate.format('YYYY-MM-DD');
        
        // その日の習慣達成状況をチェック
        const dayHabitLogs = habitLogs.filter(log => log.date === dateStr);
        const hasDiary = diaryEntries.some(entry => entry.date === dateStr);
        
        let daySymbol;
        if (specificHabitName) {
            // 特定習慣の場合
            const habit = habits[0];
            const isCompleted = dayHabitLogs.some(log => log.habitId === habit.id);
            daySymbol = isCompleted ? '✅' : (hasDiary ? '📝' : '⭕');
        } else {
            // 全習慣の場合
            const completedCount = dayHabitLogs.length;
            const totalHabits = habits.length;
            
            if (completedCount === totalHabits && completedCount > 0) {
                daySymbol = '✅'; // 全完了
            } else if (completedCount > 0) {
                daySymbol = '🔶'; // 一部完了
            } else if (hasDiary) {
                daySymbol = '📝'; // 日記のみ
            } else {
                daySymbol = '⭕'; // 未完了
            }
        }
        
        calendarDisplay += daySymbol;
        
        // 週末（日曜日）で改行
        if ((firstDayWeekday + day - 1) % 7 === 6) {
            calendarDisplay += '\n';
        } else {
            calendarDisplay += ' ';
        }
    }
    
    calendarDisplay += '\n```';
    
    // 統計情報
    const totalDays = daysInMonth;
    const completedDays = specificHabitName ? 
        habitLogs.filter(log => log.habitId === habits[0].id).length :
        Array.from(new Set(habitLogs.map(log => log.date))).length;
    
    const completionRate = totalDays > 0 ? ((completedDays / totalDays) * 100).toFixed(1) : 0;
    
    return {
        description: specificHabitName ? 
            `**${habits[0].name}** の達成状況\n完了日数: ${completedDays}/${totalDays}日 (${completionRate}%)` :
            `全習慣の達成状況\n活動日数: ${completedDays}/${totalDays}日 (${completionRate}%)`,
        display: calendarDisplay
    };
}

// 週間統計の計算
function calculateWeeklyStats(entries, startDate) {
    const weekStart = moment(startDate).startOf('isoWeek'); // 月曜始まり
    const weekEnd = weekStart.clone().add(6, 'days');
    
    const weekEntries = entries.filter(entry => {
        const entryDate = moment(entry.date);
        return entryDate.isBetween(weekStart, weekEnd, 'day', '[]');
    });
    
    return {
        totalEntries: weekEntries.length,
        averageMood: calculateAverageMood(weekEntries),
        weekRange: `${weekStart.format('MM/DD')} - ${weekEnd.format('MM/DD')}`
    };
}

// 体重推移予測機能
function predictWeightTrend(entries, predictDays = 30) {
    if (entries.length < 3) {
        throw new Error('予測には最低3日分のデータが必要です');
    }

    // 日付順にソート
    const sortedEntries = entries.sort((a, b) => moment(a.date).diff(moment(b.date)));
    const weights = sortedEntries.map(e => parseFloat(e.weight));
    const dates = sortedEntries.map(e => moment(e.date));
    
    // 線形回帰で傾向を計算
    const n = weights.length;
    const sumX = dates.reduce((sum, date, i) => sum + i, 0);
    const sumY = weights.reduce((sum, weight) => sum + weight, 0);
    const sumXY = dates.reduce((sum, date, i) => sum + (i * weights[i]), 0);
    const sumXX = dates.reduce((sum, date, i) => sum + (i * i), 0);
    
    // 回帰係数の計算
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // 相関係数の計算（信頼度の指標）
    const meanY = sumY / n;
    const ssTotal = weights.reduce((sum, weight) => sum + Math.pow(weight - meanY, 2), 0);
    const ssRes = weights.reduce((sum, weight, i) => {
        const predicted = slope * i + intercept;
        return sum + Math.pow(weight - predicted, 2);
    }, 0);
    const rSquared = 1 - (ssRes / ssTotal);
    
    // 予測値の計算
    const currentWeight = weights[weights.length - 1];
    const predictedWeight = slope * (n + predictDays - 1) + intercept;
    const predictedChange = predictedWeight - currentWeight;
    
    // 週間ペースの計算
    const weeklyTrend = slope * 7;
    
    // トレンドの方向を判定
    let trendDirection;
    if (Math.abs(weeklyTrend) < 0.1) {
        trendDirection = '➡️ 安定';
    } else if (weeklyTrend > 0) {
        trendDirection = '📈 増加傾向';
    } else {
        trendDirection = '📉 減少傾向';
    }
    
    // 信頼度の判定
    let confidence;
    if (rSquared > 0.7) {
        confidence = '高';
    } else if (rSquared > 0.4) {
        confidence = '中';
    } else {
        confidence = '低';
    }
    
    return {
        currentWeight: currentWeight.toFixed(1),
        predictedWeight: predictedWeight.toFixed(1),
        predictedChange: predictedChange >= 0 ? `+${predictedChange.toFixed(1)}` : predictedChange.toFixed(1),
        weeklyTrend: weeklyTrend >= 0 ? `+${weeklyTrend.toFixed(2)}` : weeklyTrend.toFixed(2),
        trendDirection,
        confidence,
        rSquared: rSquared.toFixed(3),
        slope: slope
    };
}

// 目標達成予測
function predictGoalAchievement(currentWeight, targetWeight, weeklyTrend) {
    const weightDifference = targetWeight - currentWeight;
    const weeklyTrendNum = parseFloat(weeklyTrend.replace('+', ''));
    
    if (Math.abs(weeklyTrendNum) < 0.01) {
        return {
            message: '現在のペースでは目標達成は困難です（体重変化がほぼありません）',
            estimatedDays: null,
            feasible: false
        };
    }
    
    // 必要な方向と実際の傾向が一致しているかチェック
    const needsIncrease = weightDifference > 0;
    const trendIsIncreasing = weeklyTrendNum > 0;
    
    if (needsIncrease !== trendIsIncreasing) {
        const direction = needsIncrease ? '増量' : '減量';
        return {
            message: `現在のトレンドでは目標達成は困難です（${direction}が必要ですが逆方向の傾向）`,
            estimatedDays: null,
            feasible: false
        };
    }
    
    // 達成予測日数の計算
    const weeksToGoal = Math.abs(weightDifference) / Math.abs(weeklyTrendNum);
    const daysToGoal = Math.round(weeksToGoal * 7);
    const achievementDate = moment().add(daysToGoal, 'days');
    
    let message;
    if (daysToGoal <= 30) {
        message = `約${daysToGoal}日後（${achievementDate.format('MM/DD')}）に目標達成予測 ✨`;
    } else if (daysToGoal <= 90) {
        message = `約${Math.round(weeksToGoal)}週間後（${achievementDate.format('MM/DD')}）に目標達成予測`;
    } else {
        const monthsToGoal = Math.round(weeksToGoal / 4.3);
        message = `約${monthsToGoal}ヶ月後（${achievementDate.format('YYYY/MM')}）に目標達成予測`;
    }
    
    return {
        message,
        estimatedDays: daysToGoal,
        achievementDate: achievementDate.format('YYYY-MM-DD'),
        feasible: true
    };
}

// 体重管理の推奨事項生成
function getWeightRecommendations(prediction) {
    const recommendations = [];
    const weeklyTrendNum = parseFloat(prediction.weeklyTrend.replace('+', ''));
    const confidence = prediction.confidence;
    
    // 信頼度に基づく推奨
    if (confidence === '低') {
        recommendations.push('📊 データのばらつきが大きいため、より継続的な記録をお勧めします');
    }
    
    // 体重変化のペースに基づく推奨
    if (Math.abs(weeklyTrendNum) > 1.0) {
        if (weeklyTrendNum > 0) {
            recommendations.push('⚠️ 体重増加ペースが速めです。食事量や運動習慣を見直してみましょう');
        } else {
            recommendations.push('⚠️ 体重減少ペースが速めです。健康的な減量ペース（週0.5-1kg）を心がけましょう');
        }
    } else if (Math.abs(weeklyTrendNum) < 0.1) {
        recommendations.push('✅ 体重は安定しています。現在の生活習慣を維持しましょう');
    } else {
        recommendations.push('👍 健康的なペースで体重が変化しています');
    }
    
    // 一般的な推奨事項
    if (weeklyTrendNum > 0.5) {
        recommendations.push('💡 食事記録をつけて摂取カロリーを意識してみましょう');
        recommendations.push('🏃‍♂️ 運動量を増やすことを検討してみてください');
    } else if (weeklyTrendNum < -0.5) {
        recommendations.push('🍽️ 栄養バランスと十分なカロリー摂取を心がけましょう');
    }
    
    return recommendations;
}

// 体重変動の安定性分析
function analyzeWeightStability(entries) {
    if (entries.length < 7) {
        return { stability: '不明', message: 'データ不足' };
    }
    
    const weights = entries.map(e => parseFloat(e.weight));
    const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    const variance = weights.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / weights.length;
    const stdDev = Math.sqrt(variance);
    
    let stability, message;
    if (stdDev < 0.3) {
        stability = '非常に安定';
        message = '体重の変動が小さく、安定した状態です';
    } else if (stdDev < 0.6) {
        stability = '安定';
        message = '適度な体重変動で、健康的な範囲です';
    } else if (stdDev < 1.0) {
        stability = 'やや不安定';
        message = '体重の変動がやや大きめです';
    } else {
        stability = '不安定';
        message = '体重の変動が大きいです。生活習慣を見直してみましょう';
    }
    
    return {
        stability,
        message,
        standardDeviation: stdDev.toFixed(2),
        coefficient: (stdDev / mean * 100).toFixed(1) // 変動係数（%）
    };
}

// 改良された体重グラフ生成（スケーリング改善版）
function generateEnhancedWeightGraph(entries, targetWeight = null) {
    if (entries.length < 2) return '十分なデータがありません（最低2日分必要）';
    
    const weights = entries.map(e => parseFloat(e.weight)).filter(w => !isNaN(w));
    if (weights.length < 2) return 'valid な体重データが不足しています';
    
    let minWeight = Math.min(...weights);
    let maxWeight = Math.max(...weights);
    
    // 目標体重がある場合は範囲に含める
    if (targetWeight && !isNaN(targetWeight)) {
        minWeight = Math.min(minWeight, targetWeight);
        maxWeight = Math.max(maxWeight, targetWeight);
    }
    
    let range = maxWeight - minWeight;
    
    // 範囲が小さすぎる場合は人為的に拡張
    if (range < 1.0) {
        const center = (minWeight + maxWeight) / 2;
        minWeight = center - 0.5;
        maxWeight = center + 0.5;
        range = 1.0;
    }
    
    // グラフのパディングを追加
    const padding = range * 0.1;
    minWeight -= padding;
    maxWeight += padding;
    range = maxWeight - minWeight;
    
    let graph = '';
    const graphHeight = 10; // 高さを増やして解像度向上
    const graphWidth = Math.min(entries.length, 30);
    
    // スムージング用の移動平均
    const smoothedWeights = [];
    for (let i = 0; i < weights.length; i++) {
        const start = Math.max(0, i - 1);
        const end = Math.min(weights.length - 1, i + 1);
        let sum = 0;
        let count = 0;
        for (let j = start; j <= end; j++) {
            sum += weights[j];
            count++;
        }
        smoothedWeights.push(sum / count);
    }
    
    // Y軸ラベルとグラフ
    for (let i = graphHeight; i >= 0; i--) {
        const value = minWeight + (range * i / graphHeight);
        graph += `${value.toFixed(1).padStart(5)} │`;
        
        // データポイントとライン
        for (let j = 0; j < graphWidth; j++) {
            if (j >= weights.length) {
                graph += ' ';
                continue;
            }
            
            const weight = smoothedWeights[j];
            const normalizedHeight = Math.round((weight - minWeight) / range * graphHeight);
            
            if (normalizedHeight === i) {
                // より多様な文字を使用
                graph += '●';
            } else if (j > 0) {
                const prevWeight = smoothedWeights[j - 1];
                const prevHeight = Math.round((prevWeight - minWeight) / range * graphHeight);
                
                // より滑らかな線を描画
                const minH = Math.min(normalizedHeight, prevHeight);
                const maxH = Math.max(normalizedHeight, prevHeight);
                
                if (i >= minH && i <= maxH) {
                    if (normalizedHeight > prevHeight) {
                        graph += '╱'; // 上昇
                    } else if (normalizedHeight < prevHeight) {
                        graph += '╲'; // 下降
                    } else {
                        graph += '─'; // 水平
                    }
                } else {
                    graph += ' ';
                }
            } else {
                graph += ' ';
            }
        }
        
        // 目標線の表示
        if (targetWeight && !isNaN(targetWeight)) {
            const targetHeight = Math.round((targetWeight - minWeight) / range * graphHeight);
            if (targetHeight === i) {
                graph += ' 🎯 目標';
            }
        }
        
        graph += '\n';
    }
    
    // X軸
    graph += '      └';
    for (let i = 0; i < graphWidth; i++) {
        graph += '─';
    }
    graph += '\n';
    
    // 日付ラベル（改良版）
    if (entries.length >= 2) {
        const firstDate = moment(entries[0].date).format('MM/DD');
        const lastDate = moment(entries[entries.length - 1].date).format('MM/DD');
        
        graph += `       ${firstDate}`;
        const spaces = Math.max(0, graphWidth - firstDate.length - lastDate.length);
        graph += ' '.repeat(spaces);
        if (graphWidth > firstDate.length + 2) {
            graph += lastDate;
        }
    }
    
    // トレンド矢印を追加
    if (weights.length >= 3) {
        const recentTrend = weights[weights.length - 1] - weights[weights.length - 3];
        let trendSymbol = '';
        if (recentTrend > 0.2) trendSymbol = ' 📈';
        else if (recentTrend < -0.2) trendSymbol = ' 📉';
        else trendSymbol = ' ➡️';
        
        graph += trendSymbol;
    }
    
    return graph;
}

// calculations.js の getChangeFromFirst 関数（改善版）
async function getChangeFromFirst(userId) {
    console.log('🔍 getChangeFromFirst 開始:', { userId: userId.substring(0, 6) + '...' });
    
    try {
        // 最初のエントリーを取得
        console.log('📊 最初の体重エントリーを取得中...');
        const firstEntry = await sheetsUtils.getFirstWeightEntry(userId);
        
        // 最新のエントリーを取得
        console.log('📊 最新の体重エントリーを取得中...');
        const latestEntry = await sheetsUtils.getLatestWeightEntry(userId);
        
        console.log('📊 取得したエントリー:', {
            firstEntry: firstEntry ? {
                date: firstEntry.date,
                weight: firstEntry.weight,
                type: typeof firstEntry.weight
            } : null,
            latestEntry: latestEntry ? {
                date: latestEntry.date,
                weight: latestEntry.weight,
                type: typeof latestEntry.weight
            } : null
        });
        
        if (!firstEntry) {
            console.log('❌ 最初のエントリーがありません');
            return null;
        }
        
        if (!latestEntry) {
            console.log('❌ 最新のエントリーがありません');
            return null;
        }
        
        // 最初と最新が同じ日付の場合（初回記録）
        if (firstEntry.date === latestEntry.date) {
            console.log('ℹ️ 初回記録のため、開始時比較をスキップ');
            return null;
        }
        
        const firstWeight = parseFloat(firstEntry.weight);
        const latestWeight = parseFloat(latestEntry.weight);
        
        console.log('🔢 重量の数値変換:', {
            firstWeight,
            latestWeight,
            firstWeightIsValid: !isNaN(firstWeight) && firstWeight > 0,
            latestWeightIsValid: !isNaN(latestWeight) && latestWeight > 0
        });
        
        if (isNaN(firstWeight) || isNaN(latestWeight) || firstWeight <= 0 || latestWeight <= 0) {
            console.log('❌ 重量データが無効です');
            return null;
        }
        
        const change = latestWeight - firstWeight;
        const startDate = moment(firstEntry.date).format('YYYY/MM/DD');
        const daysSinceStart = moment().diff(moment(firstEntry.date), 'days');
        
        // 変化が非常に小さい場合（0.05kg未満）は「変化なし」とする
        const isSignificantChange = Math.abs(change) >= 0.05;
        
        const result = {
            change: change.toFixed(1),
            changeText: isSignificantChange ? 
                (change >= 0 ? `+${change.toFixed(1)}kg` : `${change.toFixed(1)}kg`) : 
                '変化なし',
            startDate,
            daysSinceStart,
            firstWeight: firstWeight.toFixed(1),
            latestWeight: latestWeight.toFixed(1),
            direction: change > 0.05 ? '↗️' : change < -0.05 ? '↘️' : '➡️',
            isSignificantChange
        };
        
        console.log('✅ getChangeFromFirst 結果:', result);
        return result;
        
    } catch (error) {
        console.error('❌ getChangeFromFirst エラー:', error);
        console.error('❌ エラーメッセージ:', error.message);
        if (error.stack) {
            console.error('❌ エラースタック:', error.stack);
        }
        return null;
    }
}

module.exports = {
    // 気分関連
    calculateAverageMood,
    countMoodDays,
    
    // 体重関連
    calculateWeightChangeFromEntries,
    calculateBMI,
    getBMICategory,
    getHealthyWeightRange,
    calculateSafeWeightLossRate,
    validateWeightGoal,
    generateWeightGraph,
    
    // 習慣関連
    calculateBestStreak,
    calculateCurrentStreak,
    generateHabitCalendar,
    calculateWeeklyStats,

    predictWeightTrend,
    predictGoalAchievement,
    getWeightRecommendations,
    analyzeWeightStability,
    generateEnhancedWeightGraph,
    getChangeFromFirst
};
