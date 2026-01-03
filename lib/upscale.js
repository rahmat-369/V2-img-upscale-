const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

function genSerial() {
    let s = ''
    for(let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16)
    return s
}

class ImgUpscaler {
    constructor() {
        this.baseURL = 'https://api.imgupscaler.ai';
        this.serial = genSerial();
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10)',
            'product-serial': this.serial,
            'timezone': 'Asia/Jakarta',
            'origin': 'https://imgupscaler.ai',
            'referer': 'https://imgupscaler.ai/'
        };
    }

    async uploadImage(buffer, filename) {
        const form = new FormData();
        form.append('original_image_file', buffer, {
            filename: filename,
            contentType: 'image/jpeg'
        });
        form.append('upscale_type', '16'); // 16K upscale

        const headers = {
            ...form.getHeaders(),
            ...this.headers
        };

        const response = await axios.post(
            `${this.baseURL}/api/image-upscaler/v2/upscale/create-job`,
            form,
            { headers }
        );

        if (response.data.code !== 100000) {
            throw new Error(`Upload failed: ${response.data.message?.en || response.data.code}`);
        }

        return response.data.result.job_id;
    }

    async checkJob(jobId) {
        const response = await axios.get(
            `${this.baseURL}/api/image-upscaler/v1/universal_upscale/get-job/${jobId}`,
            { headers: this.headers }
        );

        return response.data;
    }

    async upscale(imageBuffer, filename = 'image.jpg', maxRetries = 30) {
        try {
            // 1. Upload dan create job
            const jobId = await this.uploadImage(imageBuffer, filename);
            
            // 2. Polling hasil
            for (let i = 0; i < maxRetries; i++) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const result = await this.checkJob(jobId);
                
                if (result.code === 100000 && result.message?.en === 'Image generated successfully.') {
                    return {
                        success: true,
                        jobId: result.result.job_id,
                        inputUrl: result.result.input_url,
                        outputUrl: result.result.output_url,
                        retries: i + 1
                    };
                }
                
                console.log(`Attempt ${i + 1}: ${result.message?.en || 'Processing...'}`);
            }
            
            throw new Error('Processing timeout after ' + maxRetries + ' retries');
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = ImgUpscaler;
