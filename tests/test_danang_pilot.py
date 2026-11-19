import unittest
from datetime import datetime, timedelta, timezone

from backend.pilot import predict_hours, vector


class PilotTests(unittest.TestCase):
    def setUp(self):
        self.origin=datetime(2025,8,1,17,tzinfo=timezone.utc)
        self.rows=[{"time":self.origin-timedelta(hours=6-i),"pm2_5":10.+i} for i in range(7)]

    def test_features_and_response(self):
        v=vector([row["pm2_5"] for row in self.rows],self.origin)
        self.assertEqual(v,[16.,15.,13.,10.,15.,13.5,0.,1.])
        got=predict_hours(self.rows,self.origin)
        self.assertEqual(got["status"],"experimental")
        self.assertEqual(got["validation"],"cams_estimates_only")
        self.assertEqual([x["horizon_h"] for x in got["predictions"]],[1,3])
        self.assertAlmostEqual(got["predictions"][0]["pm25"],16.1951918648,places=6)
        self.assertEqual(got,predict_hours(self.rows+[{"time":self.origin+timedelta(hours=1),"pm2_5":999}],self.origin))

    def test_insufficient_and_stale(self):
        self.assertEqual(predict_hours(self.rows[1:],self.origin)["status"],"insufficient_data")
        self.assertEqual(predict_hours(self.rows[:-1],self.origin)["status"],"stale")
        self.rows[3]["pm2_5"]=-1.
        self.assertEqual(predict_hours(self.rows,self.origin)["status"],"insufficient_data")
