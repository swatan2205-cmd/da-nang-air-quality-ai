# Dự báo thử nghiệm PM2.5 của ô lưới CAMS tại Đà Nẵng

Mục tiêu là dự báo giá trị PM2.5 mà mô hình khí quyển CAMS Global cung cấp cho điểm 16,0544°B, 108,2022°Đ. Tập dữ liệu có 17.544 giá trị theo giờ từ 01/01/2024 đến 31/12/2025, đủ toàn bộ lưới thời gian yêu cầu. Open-Meteo trả tâm ô lưới khoảng 16,1000°B, 108,2000°Đ. Các giá trị là nồng độ ước tính theo µg/m³. [Open-Meteo Air Quality API và Copernicus Atmosphere Monitoring Service](https://open-meteo.com/en/docs/air-quality-api)

Quy trình dùng hai mô hình Ridge trực tiếp. Mỗi mô hình nhận PM2.5 hiện tại, giá trị trễ 1, 3 và 6 giờ, trung bình trượt 3 và 6 giờ gồm giờ hiện tại, cùng sin/cos của giờ tại Việt Nam. So sánh Ridge với persistence, chọn theo MAE validation sau khi thử alpha 0,01, 1 và 100. Scaler chỉ fit trên train. Sau khi fit, quy đổi các hệ số về đơn vị gốc để giao diện dịch vụ có thể dùng chung định dạng JSON.

Train là năm 2024, validation là nửa đầu năm 2025 và test là nửa cuối năm 2025. Mỗi mẫu giữ giờ phát và giờ đích trong cùng tập, đặc trưng chỉ lấy đến giờ phát. Không fit lại sau khi mở test. Dùng lại lịch sử trước ranh giới để tái hiện điều kiện có lịch sử ở giờ dự báo.

| Chân trời | Mẫu train / validation / test | Alpha chọn | MAE validation Ridge / persistence | MAE test Ridge / persistence | RMSE test Ridge | R² test Ridge |
|---|---|---:|---|---|---:|---:|
| 1 giờ | 8.777 / 4.343 / 4.415 | 0,01 | 1,581 / 1,810 | 1,007 / 1,055 | 1,701 | 0,929 |
| 3 giờ | 8.775 / 4.341 / 4.413 | 1 | 4,122 / 4,333 | 2,608 / 2,486 | 3,558 | 0,691 |

Trên test, Ridge giảm MAE khoảng 4,6% sau 1 giờ. Ở chân trời 3 giờ, MAE **cao hơn persistence khoảng 4,9%**. Giữ nguyên lựa chọn từ validation giúp kết quả test phản ánh trung thực lựa chọn triển khai ban đầu. [Bảng đầy đủ](metrics.csv)

Dự báo khi vận hành cần 7 giờ liên tiếp kết thúc đúng giờ hiện hành, đủ PM2.5 hữu hạn và không âm. Giá trị đầu ra có cận dưới bằng 0. Nhãn xu hướng dùng ngưỡng mô tả ±1 µg/m³. Kết quả đánh giá chỉ đo khả năng dự báo chuỗi CAMS của chính ô lưới. Kho lưu trữ truy xuất hồi cứu không cung cấp thời điểm từng bản tin lịch sử thực sự sẵn có, nên cần lưu dự báo khi vận hành và kiểm tra với quan trắc độc lập trước khi kết luận về độ chính xác thực địa. Mô hình thử nghiệm chưa dùng cho khuyến nghị sức khỏe.

Từ thư mục gốc, chạy `python -m ml.train_danang`. Chương trình đọc bản dữ liệu lưu tại `data/raw/danang-cams-2024-2025.json`, tải từ URL cố định nếu tệp chưa tồn tại, rồi tạo `model.json` và `metrics.csv`. Artifact ghi URL nguồn, SHA-256 bản dữ liệu, các mốc chia, đặc trưng và toàn bộ hệ số. [Artifact](model.json)
