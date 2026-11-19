# Nguồn dữ liệu và phương pháp AQI

## Chỉ số hiển thị tại Đà Nẵng

Ứng dụng lấy `us_aqi` theo giờ do Open-Meteo cung cấp cho ô lưới CAMS tại tọa độ yêu cầu. Đơn vị API là `USAQI`; sáu nồng độ ô nhiễm có đơn vị µg/m³. Nguồn tính chỉ số tổng hợp từ các chỉ số thành phần theo thời gian trung bình của từng chất. Ứng dụng làm tròn chỉ số tới số nguyên gần nhất trước khi tra mức của AirNow. Khi đủ sáu chỉ số thành phần cùng giờ và giá trị lớn nhất khớp chỉ số chung sau làm tròn, ứng dụng liệt kê các chất cùng đạt cực đại. [Tài liệu Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) · [Các mức US AQI của AirNow](https://www.airnow.gov/aqi/aqi-basics/)

Khuyến nghị tiếng Việt về hoạt động ngoài trời tương ứng sáu mức US AQI. Dữ liệu giờ tương lai chưa dùng cho cảnh báo hiện tại. Sau ba giờ kể từ giờ hiệu lực, ứng dụng đánh dấu dữ liệu cũ và ngừng phát khuyến nghị hiện tại. Ba giờ là ngưỡng vận hành của website. [Chương trình thông báo AQI của AirNow](https://document.airnow.gov/outreach-information-divisions-aqfp.pdf) · [Hướng dẫn về hoạt động ngoài trời](https://www.airnow.gov/publications/air-quality-index/air-quality-guide-for-particle-pollution/)

## VN_AQI giờ theo Quyết định 1459/QĐ-TCMT

`backend/vn_aqi.py` tính VN_AQI giờ khi có trung bình giờ của riêng một trạm quan trắc tự động liên tục tại Việt Nam, với nguồn và quy trình kiểm soát chất lượng đã xác minh. Hàm `hourly_vn_aqi` lấy cửa sổ 12 giờ theo dấu thời gian. Ít nhất một trong PM2.5 và PM10 phải có đủ hai giá trị trong ba giờ gần nhất để tính NowCast. Các khí dùng trung bình ở giờ đích. Áp dụng công thức 1, 2 và các mốc của Bảng 2, sau đó lấy chỉ số cao nhất, làm tròn và phân loại. Hàm từ chối nguồn mô hình khí quyển. [Hướng dẫn kỹ thuật, mục 2.1 và 2.2.1](https://cem.gov.vn/storage/news_file_attach/QD%201459%20TCMT%20ngay%2012.11.2019%20AQI.pdf)

## Khả năng dùng số liệu trạm địa phương

Báo cáo tuần của Cục Môi trường nêu tên hai trạm **41 Lê Duẩn (KK-ĐN01)** và **Hoà Thuận Tây (KK-ĐN02)**. Thành phố cũng công bố IOC tích hợp quan trắc không khí và cung cấp thông tin qua Danang Smart City. Các tài liệu xác nhận sự tồn tại của nguồn thực đo. Chưa xác minh được endpoint công khai cho chuỗi PM2.5 theo giờ, điều khoản tái sử dụng và cờ kiểm soát chất lượng của từng bản ghi. Bản đồ ứng dụng hiện chỉ định vị điểm yêu cầu mô hình. Nguồn đối chứng cần có mã trạm, tọa độ, giờ hiệu lực, đơn vị, độ phủ giờ và quyền truy cập trước khi đánh giá sai số của dự báo tại Đà Nẵng. [Báo cáo tuần Cục Môi trường](https://vea.mae.gov.vn/quan-trac-moi-truong-dinh-ky/9047/ket-qua-quan-trac-chat-luong-moi-truong-khong-khi-tai-khu-vuc-mien-trung-va-tay-nguyen-tuan-3-nam-20) · [Giới thiệu IOC của thành phố](https://binhdanhocvuso.danang.gov.vn/trung-tam-giam-sat-dieu-hanh-thong-minh-da-nang-ioc-bo-nao-so-cua-do-thi-thong-minh/)
