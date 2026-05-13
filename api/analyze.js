// Vercel 에러를 막기 위해 module.exports 방식 사용
module.exports = async function handler(req, res) {
    // 오직 POST 방식의 요청만 허용합니다.
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST 요청만 가능합니다.' });
    }

    const { image } = req.body;
    
    // Vercel Environment Variables(환경변수)에 저장된 API 키를 가져옵니다.
    const apiKey = process.env.GEMINI_API_KEY; 

    if (!apiKey) {
        return res.status(500).json({ error: '서버에 API 키가 없습니다. Vercel 설정을 확인해주세요.' });
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

        const prompt = `당신은 오랜 경험을 가진 전통 관상학 전문가입니다. 
주어진 얼굴 사진을 보고 다음 3가지 주요 부위와 종합 풀이에 대한 관상 결과를 분석해주세요.
사진의 얼굴에서 보이는 관상학적 특징을 가감 없이 객관적이고 냉철하게 분석해주세요. 
좋은 점(길상)뿐만 아니라, 안 좋은 점(흉상), 주의해야 할 성격적 단점, 인간관계의 문제, 재물운의 취약점 등 부정적인 내용도 절대 피하지 말고 반드시 포함해서 상세히 적어주세요.

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
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                forehead: { type: "STRING", description: "이마/미간 관상 (초년운, 직업운 등)" },
                                eyes: { type: "STRING", description: "눈/눈썹 관상 (성격, 재물운, 애정운 등)" },
                                lowerFace: { type: "STRING", description: "코/입/턱/하관 관상 (말년운, 건강운 등)" },
                                summary: { type: "STRING", description: "관상 종합 길흉화복 풀이 (조심할 점 포함)" }
                            },
                            required: ["forehead", "eyes", "lowerFace", "summary"]
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
                    const jsonText = responseData.candidates[0].content.parts[0].text;
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
            throw new Error(`모든 AI 모델 접근 실패. (마지막 에러: ${lastError})`);
        }

        return res.status(200).json(resultJson);

    } catch (error) {
        // 서버 내부의 치명적인 에러 처리
        console.error('백엔드 치명적 에러:', error);
        return res.status(500).json({ error: '서버 내부 오류가 발생했습니다.', details: error.message });
    }
}
