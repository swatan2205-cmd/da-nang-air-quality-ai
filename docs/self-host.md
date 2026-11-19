# Triển khai FastAPI và PostgreSQL

Máy chủ lấy dữ liệu khí quyển từ hai API Open-Meteo khi khởi động và mỗi giờ sau đó. Mỗi lần lấy đọc lại bảy ngày gần nhất để cập nhật các giá trị được nhà cung cấp hiệu chỉnh. Các giờ đã thu thập được giữ trong PostgreSQL khi vượt khỏi cửa sổ bảy ngày. Giờ hiệu lực trong tương lai bị loại. Hai nguồn được xử lý trong hai giao dịch riêng, có timeout và thử lại khi lỗi kết nối hoặc lỗi máy chủ.

## Khởi động bằng Docker Compose

Từ thư mục gốc, sao chép `.env.example` thành `.env`, đặt mật khẩu riêng cho `POSTGRES_PASSWORD` rồi chạy:

```powershell
docker compose up --build -d
docker compose ps
docker compose logs api
```

Mở `http://localhost:8080`. Đổi cổng qua `WEB_PORT` khi cần. Nginx phục vụ ứng dụng React và chuyển tiếp `/api/` tới FastAPI trên mạng nội bộ. PostgreSQL ghi dữ liệu vào volume `measurements`. Container FastAPI chạy một worker để mỗi giờ chỉ có một tác vụ thu thập. Khởi động bằng `docker compose up -d` sau `docker compose stop` sẽ sử dụng lại dữ liệu đã lưu.

## Chạy API trực tiếp

```powershell
python -m pip install -r backend/requirements.txt tzdata
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Truy cập Swagger tại `http://127.0.0.1:8000/docs`. Khi chạy trực tiếp, URL mặc định sử dụng SQLite cho môi trường phát triển. Để chạy PostgreSQL, đặt `DATABASE_URL=postgresql+psycopg://` cùng các biến kết nối chuẩn `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`. Khi Vite chạy trên origin khác, thêm origin cụ thể vào `CORS_ORIGINS` phân tách bằng dấu phẩy. Giao diện và API qua cùng Nginx có thể để trống.

## Hợp đồng API

Các route GET trả JSON với khóa `data`. Dữ liệu theo giờ có `updated_at` là giờ hiệu lực mới nhất, `retrieved_at` là thời điểm thu thập và `stale` cho biết giờ hiệu lực đã quá ba giờ. Khi chưa có dữ liệu, current trả `null` hoặc AQI có trạng thái unavailable, lịch sử trả mảng rỗng. Timestamps có offset UTC.

| Route | Kết quả |
|---|---|
| /api/air-quality/current | Giờ gần nhất của nguồn không khí, các chất ô nhiễm theo µg/m³ cùng chỉ số US AQI do nguồn cung cấp |
| /api/weather/current | Nhiệt độ °C, độ ẩm %, giờ và tọa độ tâm ô lưới thời tiết |
| /api/air-quality/history | Ghép hai nguồn bằng giờ hiệu lực và điểm yêu cầu. Tham số days từ 1–366, hoặc start, end dạng ISO có offset. Trường thiếu là null |
| /api/aqi/current | Giá trị US AQI, phương pháp, mức phân loại, chất chi phối khi đủ chỉ số thành phần và hướng dẫn hiện tại |
| /api/alerts | Cảnh báo dữ liệu cũ, thiếu hoặc hướng dẫn theo chỉ số US AQI hiện tại |
| /api/stations | Điểm tham chiếu theo tọa độ với kind=model_grid |
| /api/predictions | Trạng thái kiểm định địa phương cùng các chân trời 1 giờ, 3 giờ |
| /api/model/info | Metadata artifact, thứ tự feature và kết quả Phase 2 tại Bắc Kinh |
| /api/system/status | Tình trạng kết nối cơ sở dữ liệu, lịch thu thập và lần thử mới nhất theo từng nguồn |

Khóa chính của `environment_hours` là (location_id, source_id, valid_at). Lệnh upsert lưu phiên bản truy xuất mới nhất, bao gồm tọa độ lưới, thời gian truy xuất và cờ chất lượng. Việc gọi lặp cùng khoảng giờ giữ một bản ghi cho mỗi khóa. Chính sách này phục vụ dashboard. Kiểm định hồi cứu theo thời điểm phát cần thêm kho lưu phiên bản bản tin và dự báo thực sự đã phát. Bảng `source_status` cho phép nhận biết nguồn lỗi dù dữ liệu đã lưu vẫn đọc được.

Mã phân loại AQI và quy tắc cho quan trắc VN_AQI ở `backend/aqi.py`. Đường dẫn hiện tại dùng US AQI của mô hình khí quyển. Mô hình ML phiên bản beijing-v1 chỉ có kết quả test tại Beijing. Khi có nguồn đo Đà Nẵng với quyền sử dụng được xác nhận, cần bổ sung adapter với mã nguồn, trạm, đơn vị, thời gian đo, kiểm soát chất lượng và đánh giá sai số dự báo tại địa phương.

## Kiểm chứng

```powershell
python -m pip install -r requirements.txt -r backend/requirements.txt
python -m unittest discover -s tests -v
```

Các test backend dùng SQLite độc lập và phản hồi nguồn tạo cho mục đích test. Kiểm tra tích hợp riêng ngày 18/11/2026 dùng PostgreSQL 16.2, thực hiện hai lần thu thập qua API thật, xác minh truy xuất 168 giờ trong cửa sổ bảy ngày và phân loại US AQI từ giá trị nguồn. Docker Compose chưa chạy trên máy kiểm thử do thiếu Docker Engine.
