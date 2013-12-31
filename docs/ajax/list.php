<?php

include('config.inc');
include('common.php');

session_start();

$mysqli = NULL;

if (!isset($_SESSION['user'])) {
	header('HTTP/1.0 401 Unauthorized');
        exit();
}

$return_value = array();

$mysqli = new mysqli($sql_host, $sql_user, $sql_pass, $sql_db);

if ($_REQUEST['date'] != '') {
  $date_of_interest = date('Ymd', strtotime($_REQUEST['date']));
} else {
  $date_of_interest = date('Ymd');
}

$query = 'SELECT security_events.event_id, TIME(event_time_stamp) as timefield, event_time_stamp+1 as time_stamp, filename, file_type '.
  	'FROM security_file LEFT JOIN security_events ON security_file.event_id = security_events.event_id '.
  	'WHERE event_time_stamp >= '.$date_of_interest.'000000 '.
	'AND event_time_stamp <= '.$date_of_interest.'235959 '.
	'AND deleted = 0 ORDER BY security_events.event_id DESC';

$result = $mysqli->query($query) or die("Unable to query database - $query");

while ($result && $row = $result->fetch_assoc()) {
        $parts = split_filename($row['filename']);
        if ($row['file_type'] == 8) {
                // found a movie
                $camera_data[$row['event_id']]['movie'] = str_replace($base_path, '/media', $parts[0]);
                $camera_data[$row['event_id']]['camera'] = $row['camera'];
                $camera_data[$row['event_id']]['pretty_time'] = date('g:i:s a', strtotime($row['timefield']));
		$camera_data[$row['event_id']]['refresh_id'] = $row['time_stamp'];
                if (!isset($camera_data[$row['event_id']]['thumbnail'])) {
                        $camera_data[$row['event_id']]['thumbnail'] = "/media/static";
			$camera_data[$row['event_id']]['refresh'] = 1;
                }
        } else if ($row['file_type'] == 1) {
                // jpeg
                $camera_data[$row['event_id']]['thumbnail'] = str_replace($base_path, '/media', $parts[0]);
		unset($camera_data[$row['event_id']]['refresh']);
        }
}

if (isset($camera_data)) {
	$return_value['camera_data'] = $camera_data;
}

echo json_encode($return_value);

?>
