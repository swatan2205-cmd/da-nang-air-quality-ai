# Thực nghiệm dự báo PM2.5 trên 12 trạm Bắc Kinh

Hai mô hình Random Forest độc lập được chọn ở t+1 và t+3 vì đạt MAE validation thấp nhất. Mỗi mô hình dùng 64 cây, độ sâu tối đa 16, ít nhất 6 mẫu mỗi lá, lấy mẫu bootstrap với kích thước bằng 60% tập train cho mỗi cây. Không dùng dữ liệu validation để fit lại mô hình đã chọn.

| Chân trời | Mô hình | MAE validation | MAE test | RMSE test | R² test |
|---|---|---:|---:|---:|---:|
| 1 giờ | Persistence | 8,76 | 11,47 | 22,59 | 0,948 |
| 1 giờ | Ridge | 8,72 | 10,95 | 21,22 | 0,954 |
| 1 giờ | Random Forest | 8,29 | 10,74 | 21,18 | 0,954 |
| 1 giờ | XGBoost | 8,36 | 11,01 | 21,74 | 0,951 |
| 3 giờ | Persistence | 17,22 | 24,77 | 45,50 | 0,790 |
| 3 giờ | Ridge | 17,58 | 24,77 | 43,18 | 0,811 |
| 3 giờ | Random Forest | 16,62 | 23,72 | 43,51 | 0,808 |
| 3 giờ | XGBoost | 16,70 | 23,85 | 43,33 | 0,809 |

MAE và RMSE tính bằng µg/m³. Số mẫu train / validation / test là 274.239 / 46.528 / 47.344 cho 1 giờ và 273.241 / 46.323 / 47.169 cho 3 giờ, khớp Phase 1. Dữ liệu test bao phủ tháng 09/2016 đến hết tháng 02/2017. Random Forest giảm MAE test so với persistence khoảng 6,3% và 4,2%. Ở 3 giờ, Ridge đạt RMSE tốt nhất. Thứ hạng phụ thuộc mục tiêu đánh giá và các cấu hình đã thử. Chưa ước lượng khoảng tin cậy cho chênh lệch giữa các mô hình.

## Sai số ở nồng độ cao

Nhóm có PM2.5 thực tế tại giờ đích cao hơn phân vị 95 của **nhãn train hợp lệ cho từng chân trời** gồm 3.959 mẫu test ở t+1 và 3.945 mẫu ở t+3. Random Forest có MAE lần lượt 26,68 và 66,72 µg/m³ trong nhóm này. Sai lệch trung bình là −13,27 và −55,14 µg/m³. Mô hình có xu hướng dự báo thấp trong các giờ nồng độ cao, đặc biệt ở t+3. Bảng chi tiết tách theo trạm, mùa và giờ địa phương tại thời điểm đích. [Sai số theo nhóm](test_groups.csv)

## Ý nghĩa đặc trưng

Trên validation, hoán vị riêng PM2.5 hiện tại làm tăng MAE 41,11 µg/m³ ở t+1 và 27,38 µg/m³ ở t+3. Tiếp theo là PM10 và PM2.5 trễ một giờ. Phép thử xáo các khối 24 mẫu hợp lệ liên tiếp theo thứ tự thời gian, riêng từng trạm, với một seed cố định. Các biến trễ và trung bình trượt có tương quan với PM2.5 hiện tại nên không thể diễn giải mức tăng MAE như tác động nhân quả. [Độ quan trọng trên validation](validation_importance.csv)

## Phạm vi sử dụng

Đây là kiểm thử theo thời gian tại các trạm đã xuất hiện trong train. Đà Nẵng còn khác về khí hậu, vị trí và nguồn dữ liệu đầu vào. Cần tập PM2.5 quan trắc độc lập tại Đà Nẵng, dự báo đã lưu theo giờ phát và kiểm định sai số riêng trước khi cung cấp dự báo địa phương. Các artifact hiện phục vụ thử nghiệm ngoại tuyến. [Các lần dò tham số XGBoost](folds.csv) · [Toàn bộ chỉ số](metrics.csv)
