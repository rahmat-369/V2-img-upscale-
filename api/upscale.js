const ImgUpscaler = require('../lib/upscaler');

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Hanya terima POST
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }
    
    try {
        // Cek ada file atau base64
        let imageBuffer;
        let filename = 'image.jpg';
        
        if (req.body.image) {
            // Jika dikirim sebagai base64
            const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
            
            // Ambil extension dari mime type jika ada
            const mimeType = req.body.image.match(/^data:(image\/\w+);base64,/);
            if (mimeType) {
                const ext = mimeType[1].split('/')[1];
                filename = `image.${ext}`;
            }
        } else if (req.files || req.file) {
            // Jika upload file (multipart/form-data)
            const file = req.files?.image || req.file;
            imageBuffer = file.data || file.buffer;
            filename = file.name || 'image.jpg';
        } else {
            return res.status(400).json({
                success: false,
                error: 'No image provided. Send as base64 or file upload'
            });
        }
        
        // Validasi ukuran file (max 10MB)
        if (imageBuffer.length > 10 * 1024 * 1024) {
            return res.status(400).json({
                success: false,
                error: 'File too large. Max 10MB'
            });
        }
        
        console.log(`Processing image: ${filename} (${imageBuffer.length} bytes)`);
        
        // Proses upscale
        const upscaler = new ImgUpscaler();
        const result = await upscaler.upscale(imageBuffer, filename);
        
        if (result.success) {
            return res.json({
                success: true,
                data: {
                    jobId: result.jobId,
                    inputUrl: result.inputUrl,
                    outputUrl: result.outputUrl,
                    downloadUrl: result.outputUrl // langsung bisa download
                },
                metadata: {
                    retries: result.retries,
                    timestamp: new Date().toISOString()
                }
            });
        } else {
            return res.status(500).json({
                success: false,
                error: result.error
            });
        }
        
    } catch (error) {
        console.error('Upscale error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};
