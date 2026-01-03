const axios = require('axios');
const FormData = require('form-data');

// Fungsi generate serial
function genSerial() {
    let s = ''
    for(let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16)
    return s
}

// Main handler Vercel
module.exports = async (req, res) => {
    // 1. Setup CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    
    // 2. Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // 3. Only POST allowed
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: 'Method not allowed. Use POST.' 
        });
    }
    
    try {
        console.log('Processing upscale request...');
        
        // 4. Get image from request
        let imageBuffer;
        let filename = 'image.jpg';
        
        // Case 1: Base64 image
        if (req.body && req.body.image) {
            const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
            
            // Get extension from mime type
            const mimeMatch = req.body.image.match(/^data:(image\/\w+);base64,/);
            if (mimeMatch) {
                const ext = mimeMatch[1].split('/')[1];
                filename = `image.${ext}`;
            }
        } 
        // Case 2: Binary/raw data (from multipart/form-data)
        else if (req.body && typeof req.body === 'object') {
            // Vercel already parses multipart to buffer
            imageBuffer = req.body;
        } else {
            return res.status(400).json({
                success: false,
                error: 'No image provided. Send as base64 (JSON) or file (form-data)'
            });
        }
        
        // 5. Validate file size (max 5MB)
        if (imageBuffer.length > 5 * 1024 * 1024) {
            return res.status(400).json({
                success: false,
                error: 'File too large. Max 5MB'
            });
        }
        
        console.log(`Upscaling image: ${filename} (${imageBuffer.length} bytes)`);
        
        // 6. CALL IMGUPSCALER.AI API
        const serial = genSerial();
        
        // Step 1: Create job
        const form = new FormData();
        form.append('original_image_file', imageBuffer, {
            filename: filename,
            contentType: 'image/jpeg'
        });
        form.append('upscale_type', '16'); // 16K
        
        const createHeaders = {
            ...form.getHeaders(),
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10)',
            'product-serial': serial,
            'timezone': 'Asia/Jakarta',
            'origin': 'https://imgupscaler.ai',
            'referer': 'https://imgupscaler.ai/'
        };
        
        const createResponse = await axios.post(
            'https://api.imgupscaler.ai/api/image-upscaler/v2/upscale/create-job',
            form,
            { headers: createHeaders }
        );
        
        if (createResponse.data.code !== 100000) {
            throw new Error(`Create job failed: ${createResponse.data.message?.en || createResponse.data.code}`);
        }
        
        const jobId = createResponse.data.result.job_id;
        console.log(`Job created: ${jobId}`);
        
        // Step 2: Poll for result (max 30 attempts)
        const pollHeaders = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10)',
            'product-serial': serial,
            'origin': 'https://imgupscaler.ai',
            'referer': 'https://imgupscaler.ai/'
        };
        
        let result;
        for (let attempt = 1; attempt <= 30; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 sec
            
            const pollResponse = await axios.get(
                `https://api.imgupscaler.ai/api/image-upscaler/v1/universal_upscale/get-job/${jobId}`,
                { headers: pollHeaders }
            );
            
            console.log(`Attempt ${attempt}: ${pollResponse.data.message?.en || 'Processing'}`);
            
            if (pollResponse.data.code === 100000 && 
                pollResponse.data.message?.en === 'Image generated successfully.') {
                result = pollResponse.data.result;
                break;
            }
            
            if (attempt === 30) {
                throw new Error('Processing timeout after 90 seconds');
            }
        }
        
        // 7. Return success
        return res.json({
            success: true,
            data: {
                jobId: result.job_id,
                inputUrl: result.input_url,
                outputUrl: result.output_url,
                downloadUrl: result.output_url
            },
            metadata: {
                timestamp: new Date().toISOString(),
                size: imageBuffer.length
            }
        });
        
    } catch (error) {
        console.error('Upscale error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};
