module.exports = async function handler(req, res) {
    // 오직 POST 방식의 요청만 허용합니다.
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST 요청만 가능합니다.' });
    }

    const { image } = req.body;
    const apiKey = process.env.GEMINI_API_KEY; 

    if (!apiKey) {
        return res.status(500).json({ error: '서버에 API 키가 없습니다. Vercel 환경변수를 확인해주세요.' });
    }

    if (!image) {
        return res.status(400).json({ error: '이미지가 전달되지 않았습니다.' });
    }

    try {
        // ★ [안전장치] 구글 API가 특정 모델을 거절할 경우를 대비해 순서대로 시도
        const modelsToTry = [
            'gemini-2.5-flash',
            'gemini-1.5-flash-latest',
            'gemini-1.5-flash'
        ];

        const prompt = `당신은 냉철하고 정확한 세계 최고의 손금 분석가입니다. 
주어진 손바닥 사진을 보고 3대 주요 선(생명선, 두뇌선, 감정선)과 종합 사주 풀이에 대한 결과를 분석해주세요.
좋은 말만 하지 말고, 긍정적인 부분(행운)과 부정적인 부분(불행 또는 주의할 점)을 모두 가감 없이 솔직하게 작성해주세요.

반드시 아래에 정의된 JSON 스키마 형식에 맞춰 정확한 JSON 데이터만 응답해야 합니다.`;

        let resultJson = null;
        let lastError = "";

        // 모델별로 문을 두드려봅니다.
        for (const model of modelsToTry) {
            try {
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                
                const payload = {
                    contents: [
                        {
                            role: "user",
                            parts: [
                                { text: prompt },
                                { inlineData: { mimeType: "image/jpeg", data: image } }
                            ]
                        }
                    ],
                    generationConfig: {
                        responseMimeType: "application/json",
                        // ★ [핵심] AI가 무조건 이 형태의 JSON으로만 대답하도록 강제합니다!
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                lifeLine: { type: "STRING", description: "생명선(건강, 체력) 분석 내용" },
                                headLine: { type: "STRING", description: "두뇌선(지능, 적성) 분석 내용" },
                                heartLine: { type: "STRING", description: "감정선(성격, 연애) 분석 내용" },
                                luckyPoint: { type: "STRING", description: "이 손금이 가진 최고의 행운 포인트 (재물, 귀인 등)" },
                                unluckyPoint: { type: "STRING", description: "이 손금에서 가장 조심해야 할 불행/주의 포인트 (사고, 건강, 배신 등)" },
                                summary: { type: "STRING", description: "종합 사주 풀이 내용" }
                            },
                            required: ["lifeLine", "headLine", "heartLine", "luckyPoint", "unluckyPoint", "summary"]
                        }
                    }
                };

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`[${model}] 거절됨: ${errorText}`);
                }

                const responseData = await response.json(); 
                
                // AI가 정상적으로 답변을 만들었는지 확인 후 파싱
                if (responseData.candidates && responseData.candidates.length > 0) {
                    let jsonText = responseData.candidates[0].content.parts[0].text;
                    // 혹시 모를 마크다운 찌꺼기 제거 (안전빵)
                    jsonText = jsonText.replace(/```json/g, '').replace(/
```/g, '').trim();
                    resultJson = JSON.parse(jsonText);
                    break; // 성공했으니 더 이상 다른 모델을 시도할 필요 없이 종료!
                } else {
                    throw new Error(`[${model}] 응답 생성 실패`);
                }
            } catch (error) {
                console.warn(`모델 시도 실패: ${error.message}`);
                lastError = error.message;
            }
        }

        // 모든 모델이 거절했을 경우
        if (!resultJson) {
            throw new Error(`모든 AI 모델 접근 실패. 구글 API 키 권한 문제일 수 있습니다. (마지막 에러: ${lastError})`);
        }

        // 완벽하게 파싱된 JSON 객체를 프론트엔드로 전달
        return res.status(200).json(resultJson);

    } catch (error) {
        console.error('백엔드 치명적 에러:', error);
        return res.status(500).json({ error: '서버 내부 오류가 발생했습니다.', details: error.message });
    }
}
