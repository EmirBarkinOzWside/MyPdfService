const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const hbs = require('handlebars');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx'); // <-- YENİ: Excel işlemleri için gerekli
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const path = require("path");

const app = express();
// Salesforce'tan büyük dosya (resim/excel) gelebileceği için limit yüksek olmalı
app.use(bodyParser.json({ limit: '50mb' })); 

// --- UPTIME KONTROLÜ ---
// Render.com'un servisi kapatmaması veya kontrol edilmesi için
app.get('/', (req, res) => {
    res.send('PDF Servisi Aktif ve Çalışıyor! 🚀 (Excel Desteği Eklendi)');
});

// GLOBAL TARAYICI DEĞİŞKENİ
let browser;

// Tarayıcıyı Başlatma Fonksiyonu (Singleton Pattern)
async function getBrowser() {
    if (!browser || !browser.isConnected()) {
        console.log("Yeni tarayıcı başlatılıyor...");
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Bellek tasarrufu için önemli
                '--single-process' // Hız için
            ]
        });
    }
    return browser;
}

// --- YARDIMCI FONKSİYON: Excel Base64 verisini JSON dizisine çevirir ---
function parseExcelData(base64Data, label) {
    if (!base64Data) return null;
    try {
        // 1. Base64'ü Buffer'a çevir ve oku
        const workbook = xlsx.read(base64Data, { type: 'base64' });
        
        // 2. İlk çalışma sayfasını al
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // 3. Veriyi JSON Array'e çevir (header:1 => her satır bir dizi olur)
        let rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        
        // 4. Boş satırları filtrele
        rows = rows.filter(row => row.length > 0);
        
        console.log(`${label} Excel başarıyla okundu. Satır sayısı: ${rows.length}`);
        return rows;
    } catch (e) {
        console.error(`${label} Excel okuma hatası:`, e.message);
        return null;
    }
}

app.post('/generate', async (req, res) => {
    let page = null;
    try {
        const { data } = req.body;
        if (!data) return res.status(400).json({ error: 'Veri yok.' });

        console.log("PDF isteği geldi...");

        // -------------------------------------------------------------
        // 1. EXCEL VERİLERİNİ İŞLE (YENİ EKLENEN KISIM)
        // -------------------------------------------------------------
        
        // A) Kapsam Dosyası (Mevcut)
        const excelRows = parseExcelData(data.excelBase64, "Kapsam");
        
        // B) TP Dokümanı (Zaman Planı)
        const tpExcelRows = parseExcelData(data.tpExcelBase64, "TP Document");
        
        // C) Team Dokümanı (Ekip)
        const teamExcelRows = parseExcelData(data.teamExcelBase64, "Team Document");

        // Tüm verileri birleştir
        const templateData = {
            ...data,
            excelRows: excelRows,
            tpExcelRows: tpExcelRows,
            teamExcelRows: teamExcelRows
        };

        // -------------------------------------------------------------
        // 2. ŞABLONU OKU VE DERLE
        // -------------------------------------------------------------
        const templatePath = path.resolve('./templates/teklif.html');
        // Dosya var mı kontrolü (Hata ayıklama için iyi olur)
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Şablon dosyası bulunamadı: ${templatePath}`);
        }
        
        const templateHtml = fs.readFileSync(templatePath, 'utf8');
        const template = hbs.compile(templateHtml);
        const finalHtml = template(templateData);

        // -------------------------------------------------------------
        // 3. TARAYICI İLE PDF OLUŞTUR
        // -------------------------------------------------------------
        const browserInstance = await getBrowser();
        page = await browserInstance.newPage();

        // İçeriği Yükle (waitUntil: 'networkidle0' bazen daha güvenlidir ama yavaştır. 
        // Resimler gelmiyorsa 'networkidle0' denenebilir, şimdilik hızlı modda kalsın.)
        await page.setContent(finalHtml, { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 // 60 saniye süre tanıdık (büyük dosyalar için)
        });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' } // HTML CSS ile yönettiğimiz için burayı sıfırladık
        });

        // Sekmeyi kapat
        await page.close();

        // -------------------------------------------------------------
        // 4. SONUCU GÖNDER
        // -------------------------------------------------------------
        const pdfBase64 = pdfBuffer.toString('base64');
        console.log("PDF başarıyla oluşturuldu ve gönderiliyor!");
        res.json({ status: 'Success', base64: pdfBase64 });

    } catch (error) {
        console.error("GENEL HATA:", error);
        if (page) await page.close().catch(() => {}); // Hata olursa sekmeyi kapatmaya çalış
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor!`);
    // Sunucu açılır açılmaz tarayıcıyı hazırla
    await getBrowser();
});

app.post('/create-pptx', (req, res) => {
    try {
        // 1. Salesforce'tan gelen veriyi al (Body'den)
        const data = req.body; 
        // Örnek data: { musteriAdi: "Redon", fiyat: "500 USD" ... }

        // 2. Şablon Dosyasını Oku (template.pptx dosyasının kök dizinde olduğunu varsayıyoruz)
        const content = fs.readFileSync(path.resolve(__dirname, "template.pptx"), "binary");

        // 3. Zip dosyasını yükle (PPTX aslında bir ZIP'tir)
        const zip = new PizZip(content);

        // 4. Docxtemplater'ı başlat (Paragraf ve satır sonlarını otomatik ayarlar)
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
        });

        // 5. Şablondaki {susluParantez} alanlarını Salesforce verisiyle doldur
        doc.render(data);

        // 6. Dosyayı oluştur (Buffer olarak)
        const buf = doc.getZip().generate({
            type: "nodebuffer",
            compression: "DEFLATE",
        });

        // 7. Dosyayı Base64 formatına çevirip Salesforce'a geri gönder
        const base64File = buf.toString('base64');
        
        res.json({
            status: 'success',
            fileContent: base64File,
            fileName: 'Teklif_Sunumu.pptx'
        });

    } catch (error) {
        console.error("PPTX Hatası:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});