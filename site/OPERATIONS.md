# Đồng bộ dữ liệu Đà Nẵng

Bản Sites chạy API trong Worker. Hai nguồn Open-Meteo được ghép theo giờ UTC, loại giờ tương lai và kiểm tra đơn vị. Mỗi lần thu thập thành công lưu một bản theo giờ và bản gần nhất vào BUCKET. Khi nguồn gián đoạn, dữ liệu trước đó giữ nguyên thời gian thu thập. Bản dự phòng lúc đóng gói có nguồn và thời gian trong worker/data.json.

Từ checkout của phiên bản đang phục vụ, chạy Node 22 với worker/sync.mjs. Lấy quyền dịch vụ mới từ get_site của chính Site, truyền siwc_bypass_bearer_token qua stdin ẩn. Chương trình lấy hai API, kiểm tra đơn vị, ghi qua POST /api/system/sync và đọc lại data.archived_at qua GET /api/system/status. Nếu lỗi nguồn, thử lại một lần rồi báo kết quả. Không phát hành lại mã để cập nhật số liệu.
